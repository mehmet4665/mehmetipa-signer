import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const app = express();
const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 8080);
const MAX_IPA_BYTES = 500 * 1024 * 1024;
const MAX_SIGNING_MATERIAL_BYTES = 30 * 1024 * 1024;
const SOURCE_URL = "http://ipa-source.internal/source";

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_IPA_BYTES, files: 3, fields: 12, parts: 16 },
});

app.get("/health", (_req, res) => res.status(200).json({ ok: true, engine: "zsign" }));

app.post("/sign", upload.fields([
  { name: "ipa", maxCount: 1 },
  { name: "p12", maxCount: 1 },
  { name: "mobileprovision", maxCount: 1 },
]), async (req, res) => {
  let workDir;
  const uploaded = Object.values(req.files || {}).flat();
  try {
    const ipa = req.files?.ipa?.[0];
    const p12 = req.files?.p12?.[0];
    const profile = req.files?.mobileprovision?.[0];
    const password = String(req.body?.p12_password || "");
    const jobId = String(req.body?.job_id || "");
    const sourceToken = String(req.body?.ipa_source_token || "");
    let originalName = String(req.body?.ipa_name || "");
    let expectedSize = Number(req.body?.ipa_size || 0);

    if (!p12 || !profile || !password || (!ipa && (!sourceToken || !jobId || !originalName))) {
      return res.status(400).json({ error: "IPA source, P12, provisioning profile and password are required." });
    }
    if (p12.size > MAX_SIGNING_MATERIAL_BYTES || profile.size > MAX_SIGNING_MATERIAL_BYTES ||
        !p12.originalname.toLowerCase().endsWith(".p12") ||
        !profile.originalname.toLowerCase().endsWith(".mobileprovision")) {
      return res.status(413).json({ error: "P12 or provisioning profile exceeds the 30 MB materials limit or has an unsupported type." });
    }

    if (ipa) {
      originalName = ipa.originalname;
      expectedSize = ipa.size;
    } else if (!/^[0-9a-f-]{36}$/i.test(jobId) || sourceToken.length > 2048) {
      return res.status(400).json({ error: "Invalid IPA source token." });
    }
    if (!originalName.toLowerCase().endsWith(".ipa") ||
        !Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_IPA_BYTES) {
      return res.status(400).json({ error: "Invalid IPA metadata. The maximum IPA size is 500 MB." });
    }

    workDir = await mkdtemp(path.join(tmpdir(), "mehmetipa-sign-"));
    const inputPath = path.join(workDir, "input.ipa");
    const p12Path = path.join(workDir, "certificate.p12");
    const profilePath = path.join(workDir, "profile.mobileprovision");
    const outputPath = path.join(workDir, "signed.ipa");

    await Promise.all([
      rename(p12.path, p12Path),
      rename(profile.path, profilePath),
    ]);

    if (ipa) {
      // Backward compatibility for the previous single-request IPA upload.
      await rename(ipa.path, inputPath);
    } else {
      // Fetch the original IPA through the scoped Cloudflare outbound handler.
      const sourceUrl = new URL(SOURCE_URL);
      sourceUrl.searchParams.set("token", sourceToken);
      const sourceResponse = await fetch(sourceUrl, {
        method: "GET",
        headers: { "cache-control": "no-store" },
        signal: AbortSignal.timeout(20 * 60 * 1000),
      });
      if (!sourceResponse.ok || !sourceResponse.body) {
        await sourceResponse.body?.cancel().catch(() => {});
        return res.status(sourceResponse.status || 502).json({ error: "Original IPA could not be fetched from private temporary storage." });
      }

      const advertisedSize = Number(sourceResponse.headers.get("content-length") || 0);
      if (advertisedSize && advertisedSize !== expectedSize) {
        await sourceResponse.body.cancel().catch(() => {});
        return res.status(422).json({ error: "Original IPA size did not match the upload record." });
      }

      let receivedBytes = 0;
      const sizeGuard = new Transform({
        transform(chunk, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_IPA_BYTES || receivedBytes > expectedSize) {
            callback(new Error("IPA source exceeded its declared 500 MB maximum size."));
            return;
          }
          callback(null, chunk);
        },
      });
      try {
        await pipeline(
          Readable.fromWeb(sourceResponse.body),
          sizeGuard,
          createWriteStream(inputPath, { flags: "wx" }),
        );
      } catch (error) {
        await sourceResponse.body?.cancel().catch(() => {});
        throw error;
      }
      if (receivedBytes !== expectedSize) {
        throw new Error("IPA download was incomplete; received byte count did not match the upload.");
      }
    }

    const safeBase = path.basename(originalName).replace(/\.ipa$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "app";
    const downloadName = safeBase + "-signed.ipa";

    // Preserve the original app identity so two separately installed apps do not overwrite each other.
    let originalBundleId = "";
    try {
      const original = await execFileAsync("python3", ["-c", "import zipfile,plistlib,sys,json; z=zipfile.ZipFile(sys.argv[1]); n=next((x for x in z.namelist() if x.startswith('Payload/') and x.count('/')==2 and x.endswith('.app/Info.plist')),None); p=plistlib.loads(z.read(n)) if n else {}; print(json.dumps({'id':p.get('CFBundleIdentifier','')}))", inputPath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      originalBundleId = String(JSON.parse(original.stdout).id || "");
      if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(originalBundleId)) throw new Error("IPA içinde geçerli bir CFBundleIdentifier bulunamadı.");
    } catch (error) {
      return res.status(422).json({ error: "IPA uygulama kimliği okunamadı.", diagnostic: String(error?.message || error) });
    }

    try {
      await execFileAsync("zsign", [
        "-f", "-k", p12Path, "-p", password,
        "-m", profilePath,
        "-o", outputPath, inputPath,
      ], { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
    } catch (error) {
      const diagnostic = String(error?.stderr || error?.stdout || "").split("\n").filter(Boolean).slice(-8).join("\n");
      return res.status(422).json({ error: "zSign could not sign this IPA with the active profile.", diagnostic });
    }

    const outputStat = await stat(outputPath).catch(() => null);
    if (!outputStat?.isFile() || outputStat.size < 1024 || outputStat.size > 550 * 1024 * 1024) {
      return res.status(500).json({ error: "Signing completed without a valid IPA output within the 500 MB limit." });
    }

    let appVersion = "1.0";
    try {
      const parsed = await execFileAsync("python3", ["-c", "import zipfile,plistlib,sys,json; z=zipfile.ZipFile(sys.argv[1]); n=next((x for x in z.namelist() if x.startswith('Payload/') and x.count('/')==2 and x.endswith('.app/Info.plist')),None); p=plistlib.loads(z.read(n)) if n else {}; print(json.dumps({'id':p.get('CFBundleIdentifier',''),'version':p.get('CFBundleVersion',p.get('CFBundleShortVersionString','1.0'))}))", outputPath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      const metadata = JSON.parse(parsed.stdout);
      if (!metadata.id || metadata.id !== originalBundleId) throw new Error("İmzalama Bundle ID bilgisini değiştirdi; işlem durduruldu.");
      appVersion = String(metadata.version || "1.0");
    } catch (error) {
      return res.status(422).json({ error: "Signed IPA installation metadata could not be verified.", diagnostic: String(error?.message || error) });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(outputStat.size));
    res.setHeader("Content-Disposition", "attachment; filename=\"" + downloadName + "\"");
    res.setHeader("X-App-Bundle-ID", originalBundleId);
    res.setHeader("X-App-Version", appVersion);
    res.setHeader("X-Signing-Engine", "zsign");

    const cleanupDir = workDir;
    workDir = undefined;
    res.sendFile(outputPath, (error) => {
      void rm(cleanupDir, { recursive: true, force: true });
      if (error && !res.headersSent) res.status(500).end();
    });
  } catch (error) {
    console.error("Signing request failed:", error?.message || "unknown error");
    if (!res.headersSent) res.status(500).json({ error: "Signing service failed." });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    for (const file of uploaded) {
      await rm(file.path, { force: true }).catch(() => {});
    }
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: error.code === "LIMIT_FILE_SIZE" ? "P12 or provisioning profile exceeds the 30 MB materials limit." : "Invalid upload." });
  }
  console.error("Request error:", error?.message || "unknown error");
  if (!res.headersSent) res.status(500).json({ error: "Request failed." });
});

app.listen(PORT, "0.0.0.0", () => console.log("Mehmet IPA signing engine listening on " + PORT));
