/**
 * Org-scoped hint bus. One Durable Object per organization
 * (`idFromName(organizationId)`). Hibernatable WebSockets; stamps monotonic
 * `seq` + ULID `id`; fans out opaque `{ topic, payload }` — no payload
 * validation, no topic branching, no event log / replay.
 */
import { DurableObject } from "cloudflare:workers";
import { newOrgEventId, packOrgEventFrame } from "../org-events.js";

const LAST_SEQ_KEY = "lastSeq";
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

interface PublishInput {
  topic: string;
  payload: Record<string, unknown>;
}

export class OrgEvents extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    // Cloudflare Workers hibernation API — not in browser/Node globals.
    const pair = new (
      globalThis as unknown as {
        WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };
      }
    ).WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const lastSeq = (await this.ctx.storage.get<number>(LAST_SEQ_KEY)) ?? 0;
    this.#safeSend(
      pair[1],
      JSON.stringify({ v: 1, kind: "sync", seq: lastSeq })
    );
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async publish(input: PublishInput): Promise<{ seq: number; id: string }> {
    const lastSeq = (await this.ctx.storage.get<number>(LAST_SEQ_KEY)) ?? 0;
    const seq = lastSeq + 1;
    await this.ctx.storage.put(LAST_SEQ_KEY, seq);
    const id = newOrgEventId();
    const encoded = JSON.stringify(
      packOrgEventFrame(input.topic, input.payload, seq, id)
    );
    for (const ws of this.ctx.getWebSockets()) {
      this.#safeSend(ws, encoded);
    }
    return { seq, id };
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as { kind?: unknown }).kind !== "resume"
    ) {
      return;
    }
    const lastSeqClient = (parsed as { lastSeq?: unknown }).lastSeq;
    if (typeof lastSeqClient !== "number" || !Number.isFinite(lastSeqClient)) {
      return;
    }
    const lastSeq = (await this.ctx.storage.get<number>(LAST_SEQ_KEY)) ?? 0;
    if (lastSeqClient < lastSeq) {
      this.#safeSend(
        ws,
        JSON.stringify({
          v: 1,
          kind: "resync",
          fromSeq: lastSeqClient + 1,
          toSeq: lastSeq,
        })
      );
    }
  }

  #safeSend(ws: WebSocket, data: string): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      try {
        ws.close(1008, "backpressure");
      } catch {
        // ignore close races
      }
      return;
    }
    try {
      ws.send(data);
    } catch {
      try {
        ws.close(1011, "send_failed");
      } catch {
        // ignore close races
      }
    }
  }
}
