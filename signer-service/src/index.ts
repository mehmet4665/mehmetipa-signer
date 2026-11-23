import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

interface Env {
  SIGNER: DurableObjectNamespace<SigningContainer>;
  QUEUE: DurableObjectNamespace<SigningQueue>;
  CERTS: R2Bucket;
}

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 30 * 1000;
const MAX_CONCURRENT_SIGNINGS = 10;
const ACTIVE_LEASE_MS = 30 * 60 * 1000;
const QUEUED_LEASE_MS = 15 * 60 * 1000;
const MAX_QUEUE_DEPTH = 100;
const QUEUE_NAME = "global-signing-queue";
const SOURCE_HOST = "ipa-source.internal";
const SOURCE_PAGES_URL = "https://mehmetipa-signer.pages.dev/api/signing/source";

type QueueJob = {
  job_id: string;
  user_id: string;
  status: "queued" | "active" | "complete" | "failed" | "cancelled" | "expired";
  created_at: number;
  expires_at: number | null;
  lease_until: number | null;
  started_at: number | null;
  finished_at: number | null;
  file_name: string;
  file_size: number;
  upload_key: string | null;
  upload_id: string | null;
  error: string | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export class SigningSourceHandler extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.hostname !== SOURCE_HOST || url.pathname !== "/source") {
      return new Response("Not found", { status: 404 });
    }
    const token = url.searchParams.get("token") || "";
    if (!token || token.length > 2048) return new Response("Not found", { status: 404 });
    const target = new URL(SOURCE_PAGES_URL);
    target.searchParams.set("token", token);
    return fetch(target, {
      method: "GET",
      headers: { "cache-control": "no-store", "x-mehmetipa-source": "container" },
      redirect: "manual",
    });
  }
}

export class SigningQueue extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS signing_jobs (" +
      "job_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, " +
      "created_at INTEGER NOT NULL, expires_at INTEGER, lease_until INTEGER, " +
      "started_at INTEGER, finished_at INTEGER, file_name TEXT NOT NULL, " +
      "file_size INTEGER NOT NULL, upload_key TEXT, upload_id TEXT, error TEXT);" +
      "CREATE INDEX IF NOT EXISTS signing_jobs_order_idx ON signing_jobs(status, created_at, job_id);" +
      "CREATE TABLE IF NOT EXISTS signing_artifacts (object_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);" +
      "CREATE INDEX IF NOT EXISTS signing_artifacts_expiry_idx ON signing_artifacts(expires_at);",
    );
  }

  private rows<T>(query: string, ...bindings: (string | number | null)[]): T[] {
    return this.ctx.storage.sql.exec<T>(query, ...bindings).toArray();
  }

  private promoteQueued(now = Date.now()): void {
    const active = Number(this.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM signing_jobs WHERE status = 'active' AND lease_until > ?",
      now,
    )[0]?.count || 0);
    const slots = Math.max(0, MAX_CONCURRENT_SIGNINGS - active);
    if (!slots) return;
    const queued = this.rows<{ job_id: string }>(
      "SELECT job_id FROM signing_jobs WHERE status = 'queued' AND expires_at > ? ORDER BY created_at ASC, job_id ASC LIMIT ?",
      now,
      slots,
    );
    for (const item of queued) {
      this.ctx.storage.sql.exec(
        "UPDATE signing_jobs SET status = 'active', started_at = ?, lease_until = ?, expires_at = NULL WHERE job_id = ? AND status = 'queued'",
        now,
        now + ACTIVE_LEASE_MS,
        item.job_id,
      );
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const job = this.rows<{ next_at: number | null }>(
      "SELECT MIN(CASE WHEN status = 'active' THEN lease_until WHEN status = 'queued' THEN expires_at ELSE NULL END) AS next_at FROM signing_jobs WHERE status IN ('active', 'queued')",
    )[0];
    const artifact = this.rows<{ next_at: number | null }>(
      "SELECT MIN(expires_at) AS next_at FROM signing_artifacts",
    )[0];
    const candidates = [Number(job?.next_at || 0), Number(artifact?.next_at || 0)].filter(value => value > 0);
    if (candidates.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...candidates)));
  }

  private getJob(jobId: string): QueueJob | undefined {
    return this.rows<QueueJob>("SELECT * FROM signing_jobs WHERE job_id = ? LIMIT 1", jobId)[0];
  }

  private statusFor(jobId: string, userId: string, now: number): Record<string, unknown> {
    const job = this.getJob(jobId);
    if (!job || job.user_id !== userId) return { success: false, error: "Queue ticket not found." };
    const active = Number(this.rows<{ count: number }>(
      "SELECT COUNT(*) AS count FROM signing_jobs WHERE status = 'active' AND lease_until > ?",
      now,
    )[0]?.count || 0);
    const position = job.status === "queued"
      ? Number(this.rows<{ count: number }>(
          "SELECT COUNT(*) AS count FROM signing_jobs WHERE status = 'queued' AND (created_at < ? OR (created_at = ? AND job_id <= ?))",
          job.created_at, job.created_at, job.job_id,
        )[0]?.count || 0)
      : 0;
    return {
      success: true,
      job_id: jobId,
      status: job.status,
      queue_position: position,
      active_count: active,
      max_concurrent: MAX_CONCURRENT_SIGNINGS,
      estimated_wait_seconds: position > 0 ? Math.ceil(position / MAX_CONCURRENT_SIGNINGS) * 300 : 0,
      file_name: job.file_name,
      file_size: job.file_size,
      error: job.error,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+|\/+$/g, "");
    const now = Date.now();

    if (action === "enqueue" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const jobId = String(body.job_id || "");
      const userId = String(body.user_id || "");
      const fileName = String(body.file_name || "application.ipa").slice(0, 180);
      const fileSize = Number(body.file_size || 0);
      if (!isUuid(jobId) || !userId || userId.length > 128 ||
          !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > 500 * 1024 * 1024 ||
          !fileName.toLowerCase().endsWith(".ipa")) {
        return json({ success: false, error: "Invalid signing queue request." }, 400);
      }
      const existing = this.getJob(jobId);
      if (existing) {
        if (existing.user_id !== userId) return json({ success: false, error: "Queue ticket owner mismatch." }, 403);
        this.promoteQueued(now);
        await this.scheduleNextAlarm();
        return json(this.statusFor(jobId, userId, now));
      }
      const count = Number(this.rows<{ count: number }>(
        "SELECT COUNT(*) AS count FROM signing_jobs WHERE status IN ('queued', 'active') AND (lease_until IS NULL OR lease_until > ?)",
        now,
      )[0]?.count || 0);
      if (count >= MAX_QUEUE_DEPTH) {
        return json({ success: false, error: "İmza kuyruğu şu anda dolu. Birkaç dakika sonra tekrar dene." }, 429);
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO signing_jobs (job_id, user_id, status, created_at, expires_at, file_name, file_size) VALUES (?, ?, 'queued', ?, ?, ?, ?)",
        jobId, userId, now, now + QUEUED_LEASE_MS, fileName, fileSize,
      );
      this.promoteQueued(now);
      await this.scheduleNextAlarm();
      return json(this.statusFor(jobId, userId, now), 201);
    }

    if (action === "status" && request.method === "GET") {
      const jobId = url.searchParams.get("job_id") || "";
      const userId = url.searchParams.get("user_id") || "";
      if (!isUuid(jobId) || !userId) return json({ success: false, error: "Invalid queue ticket." }, 400);
      this.promoteQueued(now);
      const job = this.getJob(jobId);
      if (!job || job.user_id !== userId) return json({ success: false, error: "Queue ticket not found." }, 404);
      if (job.status === "active") {
        this.ctx.storage.sql.exec(
          "UPDATE signing_jobs SET lease_until = ? WHERE job_id = ? AND status = 'active'",
          now + ACTIVE_LEASE_MS, jobId,
        );
      } else if (job.status === "queued") {
        this.ctx.storage.sql.exec(
          "UPDATE signing_jobs SET expires_at = ? WHERE job_id = ? AND status = 'queued'",
          now + QUEUED_LEASE_MS, jobId,
        );
      }
      const state = this.statusFor(jobId, userId, now);
      await this.scheduleNextAlarm();
      return json(state);
    }

    if (action === "attach-upload" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const jobId = String(body.job_id || "");
      const userId = String(body.user_id || "");
      const key = String(body.upload_key || "");
      const uploadId = String(body.upload_id || "");
      const job = this.getJob(jobId);
      if (!isUuid(jobId) || !job || job.user_id !== userId || job.status !== "active") {
        return json({ success: false, error: "Active signing queue ticket required." }, 409);
      }
      if (key !== "temp-ipas/" + jobId + ".ipa" || !uploadId || uploadId.length > 512) {
        return json({ success: false, error: "Invalid multipart upload reference." }, 400);
      }
      this.ctx.storage.sql.exec(
        "UPDATE signing_jobs SET upload_key = ?, upload_id = ?, lease_until = ? WHERE job_id = ? AND status = 'active'",
        key, uploadId, now + ACTIVE_LEASE_MS, jobId,
      );
      await this.scheduleNextAlarm();
      return json({ success: true });
    }

    if (action === "release" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const jobId = String(body.job_id || "");
      const userId = String(body.user_id || "");
      const requested = String(body.status || "failed");
      const status = ["complete", "failed", "cancelled"].includes(requested) ? requested : "failed";
      const job = this.getJob(jobId);
      if (!isUuid(jobId) || !job || job.user_id !== userId) {
        return json({ success: false, error: "Queue ticket not found." }, 404);
      }
      if (["complete", "failed", "cancelled"].includes(job.status)) {
        return json({ success: true, status: job.status });
      }
      this.ctx.storage.sql.exec(
        "UPDATE signing_jobs SET status = ?, finished_at = ?, lease_until = NULL, expires_at = NULL, upload_id = NULL, upload_key = NULL, error = ? WHERE job_id = ?",
        status, now, String(body.error || "").slice(0, 500), jobId,
      );
      this.promoteQueued(now);
      await this.scheduleNextAlarm();
      return json({ success: true, status });
    }

    if (action === "artifact" && request.method === "POST") {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const key = String(body.object_key || "");
      const expiresAt = Number(body.expires_at || 0);
      if (!key.startsWith("signed-installs/") || !Number.isFinite(expiresAt) ||
          expiresAt <= now || expiresAt > now + 10 * 60 * 1000) {
        return json({ success: false, error: "Invalid signed artifact expiry." }, 400);
      }
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO signing_artifacts (object_key, expires_at) VALUES (?, ?)",
        key, expiresAt,
      );
      await this.scheduleNextAlarm();
      return json({ success: true, expires_at: expiresAt });
    }

    return json({ success: false, error: "Not found." }, 404);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const stale = this.rows<QueueJob>(
      "SELECT * FROM signing_jobs WHERE (status = 'active' AND lease_until <= ?) OR (status = 'queued' AND expires_at <= ?)",
      now, now,
    );
    for (const job of stale) {
      if (job.upload_id && job.upload_key) {
        try { await this.env.CERTS.resumeMultipartUpload(job.upload_key, job.upload_id).abort(); } catch {}
      }
      if (job.upload_key) await this.env.CERTS.delete(job.upload_key).catch(() => {});
      await this.env.CERTS.delete("upload-sessions/" + job.job_id + ".json").catch(() => {});
      this.ctx.storage.sql.exec(
        "UPDATE signing_jobs SET status = 'expired', finished_at = ?, lease_until = NULL, expires_at = NULL, upload_id = NULL, upload_key = NULL, error = 'Queue lease expired' WHERE job_id = ? AND status IN ('active', 'queued')",
        now, job.job_id,
      );
    }

    const due = this.rows<{ object_key: string }>(
      "SELECT object_key FROM signing_artifacts WHERE expires_at <= ?",
      now,
    );
    for (const item of due) {
      await this.env.CERTS.delete(item.object_key).catch(() => {});
      this.ctx.storage.sql.exec("DELETE FROM signing_artifacts WHERE object_key = ?", item.object_key);
    }

    this.ctx.storage.sql.exec(
      "DELETE FROM signing_jobs WHERE status IN ('complete', 'failed', 'cancelled', 'expired') AND finished_at < ?",
      now - 24 * 60 * 60 * 1000,
    );
    this.promoteQueued(now);
    await this.scheduleNextAlarm();
  }
}

export class SigningContainer extends DurableObject<Env> {
  private starting?: Promise<void>;

  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    if (!container) return Response.json({ error: "Container runtime is unavailable." }, { status: 503 });
    this.starting ??= this.startAndWaitForPort(container).finally(() => { this.starting = undefined; });
    try {
      await this.starting;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
      console.error("Mehmet IPA container startup failed", { detail, cause, running: container.running });
      return Response.json({ error: "Signing container failed to start.", detail, cause }, { status: 503 });
    }

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    try {
      return await container.getTcpPort(PORT).fetch(forwarded);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Mehmet IPA container request forwarding failed", { detail, running: container.running });
      return Response.json({ error: "Container request forwarding failed.", detail }, { status: 503 });
    }
  }

  private async startAndWaitForPort(container: NonNullable<DurableObjectState["container"]>): Promise<void> {
    if (!container.running) {
      const image = container.images?.base;
      if (!image) throw new Error("Container image 'base' is missing from the deployed Worker version.");
      await container.interceptOutboundHttp(SOURCE_HOST, this.ctx.exports.SigningSourceHandler);
      container.start({
        image,
        instance: "standard-1",
        enableInternet: false,
        env: { PORT: String(PORT) },
      });
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    let lastError: unknown;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/health", { signal: AbortSignal.timeout(1500) });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error("Container health endpoint returned HTTP " + response.status);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(300);
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError || "no health response");
    throw new Error("Container did not become ready on port " + PORT + ": " + detail, { cause: lastError });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, engine: "zsign", queue_limit: MAX_CONCURRENT_SIGNINGS });
    }
    if (url.pathname.startsWith("/queue/")) {
      const queuePath = url.pathname.slice("/queue".length) + url.search;
      return env.QUEUE.getByName(QUEUE_NAME).fetch(new Request("https://queue.internal" + queuePath, request));
    }
    if (url.pathname !== "/sign" || request.method !== "POST") return json({ error: "Not found" }, 404);
    const jobId = request.headers.get("x-signing-job-id") || "";
    if (!isUuid(jobId)) return json({ error: "Invalid signing job identifier." }, 400);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 40 * 1024 * 1024) return json({ error: "Signing materials exceed the 40 MB limit." }, 413);
    return env.SIGNER.getByName("vip-signing-" + jobId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
