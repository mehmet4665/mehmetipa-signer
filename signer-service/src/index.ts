import { DurableObject } from "cloudflare:workers";

interface Env {
  SIGNER: DurableObjectNamespace<SigningContainer>;
  SERVICE_TOKEN: string;
}

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export class SigningContainer extends DurableObject<Env> {
  private starting?: Promise<void>;

  async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    if (!container) return Response.json({ error: "Container runtime is unavailable." }, { status: 503 });

    this.starting ??= this.startAndWait(container).finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return container.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWait(container: NonNullable<DurableObjectState["container"]>): Promise<void> {
    if (!this.env.SERVICE_TOKEN) throw new Error("SERVICE_TOKEN secret is not configured.");
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "standard-1",
        enableInternet: false,
        env: {
          PORT: String(PORT),
          SERVICE_TOKEN: this.env.SERVICE_TOKEN
        }
      });
    }

    const port = container.getTcpPort(PORT);
    let lastError: unknown;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(1500)
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(300);
    }
    throw new Error("Signing container did not become ready.", { cause: lastError });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ ok: true, service: "mehmetipa-signing" });
    }
    if (url.pathname !== "/sign" || request.method !== "POST") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const expected = env.SERVICE_TOKEN ? `Bearer ${env.SERVICE_TOKEN}` : "";
    if (!expected || request.headers.get("authorization") !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 105 * 1024 * 1024) {
      return Response.json({ error: "IPA upload exceeds 100 MB." }, { status: 413 });
    }
    return env.SIGNER.getByName("vip-signing").fetch(request);
  }
} satisfies ExportedHandler<Env>;
