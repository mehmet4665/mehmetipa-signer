import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, rename, copyFile, mkdir } from "node:fs/promises";
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

// A forwarding retry can reach the same container after the original request
// has already started or completed. Serialize by job ID and keep the signed
// result briefly so a retry returns the same IPA rather than signing twice.
const activeSigningJobs = new Map();
const completedSigningJobs = new Map();
const SIGNED_RESULT_TTL_MS = 10 * 60 * 1000;
const SIGNED_RESULT_DIR = path.join(tmpdir(), "mehmetipa-signed-results");

function sendSignedArtifact(res, artifact, cleanupDir) {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(artifact.size));
  res.setHeader("Content-Disposition", "attachment; filename=\"" + artifact.fileName + "\"");
  res.setHeader("X-App-Bundle-ID", artifact.bundleId);
  res.setHeader("X-App-Version", artifact.version);
  res.setHeader("X-Signing-Engine", "zsign");
  res.sendFile(artifact.path, (error) => {
    if (cleanupDir) void rm(cleanupDir, { recursive: true, force: true });
    if (error && !res.headersSent) res.status(500).end();
  });
}

async function removeUploadedFiles(files) {
  await Promise.all(files.map(file => rm(file.path, { force: true }).catch(() => {})));
}

function pruneSignedArtifacts() {
  const now = Date.now();
  for (const [jobId, artifact] of completedSigningJobs) {
    if (artifact.expiresAt <= now) {
      completedSigningJobs.delete(jobId);
      void rm(artifact.path, { force: true }).catch(() => {});
    }
  }
}

app.get("/health", (_req, res) => res.status(200).json({ ok: true, engine: "zsign" }));

app.post("/sign", upload.fields([
  { name: "ipa", maxCount: 1 },
  { name: "p12", maxCount: 1 },
  { name: "mobileprovision", maxCount: 1 },
]), async (req, res) => {
  let workDir;
  const uploaded = Object.values(req.files || {}).flat();
  const jobId = String(req.body?.job_id || req.get("x-signing-job-id") || "");
  pruneSignedArtifacts();

  if (/^[0-9a-f-]{36}$/i.test(jobId)) {
    const cached = completedSigningJobs.get(jobId);
    if (cached && cached.expiresAt > Date.now()) {
      await removeUploadedFiles(uploaded);
      return sendSignedArtifact(res, cached);
    }

    const pending = activeSigningJobs.get(jobId);
    if (pending) {
      await removeUploadedFiles(uploaded);
      try {
        const artifact = await pending;
        return sendSignedArtifact(res, artifact);
      } catch (error) {
        return res.status(503).json({
          error: "Önceki imzalama denemesi tamamlanmadı; aynı dosya güvenli şekilde yeniden denenebilir.",
          code: "SIGNING_JOB_RETRY_REQUIRED",
        });
      }
    }
  }

  let resolveActiveJob;
  let rejectActiveJob;
  let activeJobPromise;
  let activeJobSettled = false;
  if (/^[0-9a-f-]{36}$/i.test(jobId)) {
    activeJobPromise = new Promise((resolve, reject) => {
      resolveActiveJob = resolve;
      rejectActiveJob = reject;
    });
    activeJobPromise.catch(() => {});
    activeSigningJobs.set(jobId, activeJobPromise);
  }

  try {
    const ipa = req.files?.ipa?.[0];
    const p12 = req.files?.p12?.[0];
    const profile = req.files?.mobileprovision?.[0];
    const password = String(req.body?.p12_password || "");
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
      const sourceResponse = await fetch(SOURCE_URL, {
        method: "GET",
        headers: {
          "cache-control": "no-store",
          authorization: "Bearer " + sourceToken,
        },
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

    let zsignOutput = "";
    let zsignErrorOutput = "";
    try {
      const signingResult = await execFileAsync("zsign", [
        "-f", "-k", p12Path, "-p", password,
        "-m", profilePath,
        // Zsign defaults to ZIP level 0 (store/no compression). Recompress
        // signed large IPAs so the expanded app bundle does not exceed the
        // output guard merely because the source IPA was originally compressed.
        "-z", "3",
        "-o", outputPath, inputPath,
      ], { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
      zsignOutput = String(signingResult.stdout || "").slice(-3000);
      zsignErrorOutput = String(signingResult.stderr || "").slice(-3000);
    } catch (error) {
      const diagnostic = String(error?.stderr || error?.stdout || "").split("\n").filter(Boolean).slice(-8).join("\n");
      return res.status(422).json({ error: "zSign could not sign this IPA with the active profile.", diagnostic });
    }

    const outputStat = await stat(outputPath).catch(() => null);
    if (!outputStat?.isFile() || outputStat.size < 1024 || outputStat.size > 550 * 1024 * 1024) {
      // Keep diagnostics server-side; never expose certificate or signing material.
      console.error("[Mehmet IPA] Signed IPA output validation failed", {
        inputBytes: expectedSize,
        outputExists: Boolean(outputStat?.isFile()),
        outputBytes: Number(outputStat?.size || 0),
        outputLimitBytes: 550 * 1024 * 1024,
        zipLevel: 3,
        stdout: zsignOutput,
        stderr: zsignErrorOutput,
      });
      return res.status(500).json({ error: "İmzalama çıktısı geçersiz veya 550 MB güvenlik sınırını aşıyor. Ayrıntı sunucu kayıtlarına yazıldı." });
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

    await mkdir(SIGNED_RESULT_DIR, { recursive: true });
    const cachedPath = path.join(SIGNED_RESULT_DIR, jobId + ".ipa");
    await copyFile(outputPath, cachedPath);
    const artifact = {
      path: cachedPath,
      size: outputStat.size,
      fileName: downloadName,
      bundleId: originalBundleId,
      version: appVersion,
      expiresAt: Date.now() + SIGNED_RESULT_TTL_MS,
    };
    completedSigningJobs.set(jobId, artifact);
    if (resolveActiveJob && !activeJobSettled) {
      activeJobSettled = true;
      resolveActiveJob(artifact);
    }

    const cleanupDir = workDir;
    workDir = undefined;
    return sendSignedArtifact(res, artifact, cleanupDir);
  } catch (error) {
    if (rejectActiveJob && !activeJobSettled) {
      activeJobSettled = true;
      rejectActiveJob(error);
    }
    console.error("Signing request failed:", error?.message || "unknown error");
    if (!res.headersSent) res.status(500).json({ error: "Signing service failed." });
  } finally {
    if (activeJobPromise && activeSigningJobs.get(jobId) === activeJobPromise) {
      if (!activeJobSettled && rejectActiveJob) {
        activeJobSettled = true;
        rejectActiveJob(new Error("Signing job ended without a verified IPA artifact."));
      }
      activeSigningJobs.delete(jobId);
    }
    if (workDir) await rm(workDir, { recursive: true, force: true });
    await removeUploadedFiles(uploaded);
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
