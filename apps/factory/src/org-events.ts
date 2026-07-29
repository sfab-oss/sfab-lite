/**
 * Factory org events — typed publish helper for the hint bus.
 *
 * Packs a closed topic union into `{ topic, payload }` and fans out through
 * the org-scoped Durable Object. Callers never stamp seq/id or put org on the
 * wire; those are server-side. Fan-out failures must not fail the write that
 * triggered the publish.
 */
import { monotonicFactory } from "ulid";

const nextEventUlid = monotonicFactory();

export type OrgEventInput =
  | {
      topic: "app_list_changed";
      payload?: { appId?: string };
    }
  | {
      topic: "app_record_changed";
      payload: { appId: string };
    }
  | {
      topic: "app_live_version_changed";
      payload: { appId: string; liveVersionId: string };
    };

export interface OrgEventWire {
  v: 1;
  kind: "event";
  seq: number;
  id: string;
  topic: string;
  payload: Record<string, unknown>;
}

export type OrgServerFrame =
  | OrgEventWire
  | { v: 1; kind: "sync"; seq: number }
  | { v: 1; kind: "resync"; fromSeq: number; toSeq: number };

export function newOrgEventId(): string {
  return `evt_${nextEventUlid()}`;
}

export function packOrgEventFrame(
  topic: string,
  payload: Record<string, unknown>,
  seq: number,
  id: string
): OrgEventWire {
  return {
    v: 1,
    kind: "event",
    seq,
    id,
    topic,
    payload,
  };
}

export function packOrgEvent(
  event: OrgEventInput,
  seq: number,
  id: string
): OrgEventWire {
  return packOrgEventFrame(
    event.topic,
    (event.payload ?? {}) as Record<string, unknown>,
    seq,
    id
  );
}

export function publishOrgEvent(
  ctx: { env: Env; organizationId: string },
  event: OrgEventInput
): void {
  const stub = ctx.env.ORG_EVENTS.get(
    ctx.env.ORG_EVENTS.idFromName(ctx.organizationId)
  );
  stub
    .publish({ topic: event.topic, payload: event.payload ?? {} })
    .catch(() => undefined);
}
