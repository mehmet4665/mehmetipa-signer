import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const app = express();
const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 8080);
const MAX_IPA_BYTES = 100 * 1024 * 1024;

const upload = multer({
  // Use the OS-managed writable temp directory; /tmp/mehmetipa is root-owned in the image.
  dest: tmpdir(),
  limits: { fileSize: MAX_IPA_BYTES, files: 3, fields: 8, parts: 12 },
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
    if (!ipa || !p12 || !profile || !password) {
      return res.status(400).json({ error: "IPA, P12, provisioning profile and password are required." });
    }
    if (!ipa.originalname.toLowerCase().endsWith(".ipa") ||
        !p12.originalname.toLowerCase().endsWith(".p12") ||
        !profile.originalname.toLowerCase().endsWith(".mobileprovision")) {
      return res.status(400).json({ error: "Unsupported signing file type." });
    }

    workDir = await mkdtemp(path.join(tmpdir(), "mehmetipa-sign-"));
    const inputPath = path.join(workDir, "input.ipa");
    const p12Path = path.join(workDir, "certificate.p12");
    const profilePath = path.join(workDir, "profile.mobileprovision");
    const outputPath = path.join(workDir, "signed.ipa");
    await Promise.all([
      rename(ipa.path, inputPath),
      rename(p12.path, p12Path),
      rename(profile.path, profilePath)
    ]);

    const safeBase = path.basename(ipa.originalname, ".ipa").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "app";
    const downloadName = `${safeBase}-signed.ipa`;

    try {
      await execFileAsync("zsign", [
        "-f", "-k", p12Path, "-p", password,
        "-m", profilePath, "-o", outputPath, inputPath
      ], { timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
    } catch (error) {
      const diagnostic = String(error?.stderr || error?.stdout || "").split("\n").filter(Boolean).slice(-8).join("\n");
      return res.status(422).json({ error: "zSign could not sign this IPA with the active profile.", diagnostic });
    }

    const outputStat = await stat(outputPath).catch(() => null);
    if (!outputStat?.isFile() || outputStat.size < 1024) {
      return res.status(500).json({ error: "Signing completed without a valid IPA output." });
    }

    const cleanupDir = workDir;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(outputStat.size));
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.setHeader("X-Signing-Engine", "zsign");
    res.sendFile(outputPath, (error) => {
      void rm(cleanupDir, { recursive: true, force: true });
      if (error && !res.headersSent) res.status(500).end();
    });
    workDir = undefined;
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
    return res.status(status).json({ error: error.code === "LIMIT_FILE_SIZE" ? "IPA upload exceeds 100 MB." : "Invalid upload." });
  }
  console.error("Request error:", error?.message || "unknown error");
  if (!res.headersSent) res.status(500).json({ error: "Request failed." });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Mehmet IPA signing engine listening on ${PORT}`));
