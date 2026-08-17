/**
 * Factory org events — typed publish helper for the hint bus.
 *
 * Packs a closed topic union into `{ topic, payload }` and fans out through
 * the org-scoped Durable Object. Callers never stamp seq/id or put org on the
 * wire; those are server-side. Fan-out failures must not fail the write that
 * triggered the publish.
 */
import { monotonicFactory } from "ulid";
import { z } from "zod";

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
      topic: "app_live_changed";
      payload: { appId: string; liveSha: string };
    };

export const orgEventPayloadSchema = z.record(z.string(), z.unknown());
export type OrgEventPayload = z.infer<typeof orgEventPayloadSchema>;

const orgEventWireSchema = z.object({
  v: z.literal(1),
  kind: z.literal("event"),
  seq: z.number(),
  id: z.string(),
  topic: z.string(),
  payload: orgEventPayloadSchema,
});
export type OrgEventWire = z.infer<typeof orgEventWireSchema>;

export const orgServerFrameSchema = z.discriminatedUnion("kind", [
  z.object({
    v: z.literal(1),
    kind: z.literal("sync"),
    seq: z.number(),
  }),
  z.object({
    v: z.literal(1),
    kind: z.literal("resync"),
    fromSeq: z.number(),
    toSeq: z.number(),
  }),
  orgEventWireSchema,
]);
export type OrgServerFrame = z.infer<typeof orgServerFrameSchema>;

export function newOrgEventId(): string {
  return `evt_${nextEventUlid()}`;
}

export function packOrgEventFrame(
  topic: string,
  payload: OrgEventPayload,
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
    orgEventPayloadSchema.parse(event.payload ?? {}),
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
    .publish({
      topic: event.topic,
      payload: orgEventPayloadSchema.parse(event.payload ?? {}),
    })
    .catch(() => undefined);
}
