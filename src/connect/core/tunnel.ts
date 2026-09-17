import { WebSocket } from "ws";

export interface TunnelClientOptions {
  tunnelUrl: string;
  token?: string;
  onMessage: (data: string) => void | Promise<void>;
  onError?: (err: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class TunnelClient {
  private ws: WebSocket | null = null;
  private isClosedManually = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private options: TunnelClientOptions) {}

  public connect(): void {
    this.isClosedManually = false;

    const headers: Record<string, string> = {};
    if (this.options.token) {
      headers["Authorization"] = `Bearer ${this.options.token}`;
    }

    try {
      this.ws = new WebSocket(this.options.tunnelUrl, { headers });

      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        this.options.onConnect?.();
      });

      this.ws.on("message", async (data) => {
        try {
          const str = data.toString();
          let parsed: any = null;
          try {
            parsed = JSON.parse(str);
          } catch {}

          if (parsed && typeof parsed === "object") {
            // 1. Inbound Tunnel HTTP Request (forwarded by Wirebox Edge DO)
            if (parsed.type === "http_request") {
              // Acknowledge DO immediately with 200 OK so upstream delivery succeeds
              this.send({
                type: "http_response",
                id: parsed.id,
                status: 200,
                headers: { "content-type": "application/json" },
                body: Buffer.from(JSON.stringify({ status: "ok" })).toString("base64"),
              });

              let bodyStr = "";
              if (parsed.body) {
                try {
                  bodyStr = Buffer.from(parsed.body, "base64").toString("utf-8");
                } catch {
                  bodyStr = parsed.body;
                }
              }

              if (bodyStr) {
                await this.options.onMessage(bodyStr);
              }
              return;
            }

            // 2. Heartbeat Ping / Pong
            if (parsed.type === "ping") {
              this.send({ type: "pong" });
              return;
            }
          }

          // 3. Direct JSON or raw frame
          await this.options.onMessage(str);
        } catch (err: any) {
          this.options.onError?.(err);
        }
      });

      this.ws.on("close", () => {
        this.options.onDisconnect?.();
        if (!this.isClosedManually) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        this.options.onError?.(err);
      });
    } catch (err: any) {
      this.options.onError?.(err);
      this.scheduleReconnect();
    }
  }

  public send(data: string | Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      this.ws.send(payload);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  public close(): void {
    this.isClosedManually = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
