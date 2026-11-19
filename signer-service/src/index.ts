import { DurableObject } from "cloudflare:workers";

interface Env {
  SIGNER: DurableObjectNamespace<SigningContainer>;
}

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const SIGNER_NAME = "vip-signing";

export class SigningContainer extends DurableObject<Env> {
  private starting?: Promise<void>;

  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    if (!container) {
      return Response.json({ error: "Container runtime is unavailable." }, { status: 503 });
    }

    this.starting ??= this.startAndWaitForPort(container).finally(() => {
      this.starting = undefined;
    });

    try {
      await this.starting;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : undefined;
      console.error("Mehmet IPA container startup failed", {
        detail,
        cause,
        running: container.running,
        imageAvailable: Boolean(container.images?.base),
      });
      return Response.json({
        error: "Signing container failed to start.",
        detail,
        cause,
        running: container.running,
        imageAvailable: Boolean(container.images?.base),
      }, { status: 503 });
    }

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return container.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWaitForPort(
    container: NonNullable<DurableObjectState["container"]>
  ): Promise<void> {
    if (!container.running) {
      const image = container.images?.base;
      if (!image) {
        throw new Error("Container image 'base' is missing from the deployed Worker version.");
      }

      // start() initiates the VM boot; the readiness loop below waits for the HTTP server.
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
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(1500),
        });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error("Container health endpoint returned HTTP " + response.status);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(300);
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError || "no health response");
    throw new Error("Container did not become ready on port " + PORT + ": " + detail, {
      cause: lastError,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // This probes the real Container via the Durable Object; it is not a Worker-only ping.
    if (url.pathname === "/health" && request.method === "GET") {
      return env.SIGNER.getByName(SIGNER_NAME).fetch(
        new Request("https://container.internal/health", { method: "GET" })
      );
    }

    if (url.pathname !== "/sign" || request.method !== "POST") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 105 * 1024 * 1024) {
      return Response.json({ error: "IPA upload exceeds 100 MB." }, { status: 413 });
    }

    return env.SIGNER.getByName(SIGNER_NAME).fetch(request);
  },
} satisfies ExportedHandler<Env>;
