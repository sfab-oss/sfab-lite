import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { notifyLiveVersion } from "@/features/preview/live-version-bus";
import type { OrgServerFrame } from "@/org-events";
import {
  type OrgEventsRouterDeps,
  routeOrgEvent,
} from "./org-events-router-core";

const RECONNECT_MS = 1500;
const INVALIDATE_DEBOUNCE_MS = 50;

function orgEventsWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/protected/org-events/ws`;
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

/**
 * Long-lived org WebSocket while signed into the factory console.
 * Maps topics → debounced React Query invalidation + preview reload hints.
 */
export function OrgEventsRouter({
  refreshAttendedApp,
}: {
  refreshAttendedApp?: (appId: string) => void;
}) {
  const queryClient = useQueryClient();
  const refreshRef = useRef(refreshAttendedApp);
  refreshRef.current = refreshAttendedApp;
  const lastSeqRef = useRef<number | null>(null);
  const pendingRef = useRef<Set<() => void>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const flush = () => {
      timerRef.current = null;
      const pending = [...pendingRef.current];
      pendingRef.current.clear();
      for (const run of pending) {
        run();
      }
    };

    const coalesce = (run: () => void) => {
      pendingRef.current.add(run);
      if (timerRef.current != null) {
        return;
      }
      timerRef.current = window.setTimeout(flush, INVALIDATE_DEBOUNCE_MS);
    };

    const deps: OrgEventsRouterDeps = {
      coalesce,
      invalidateApps: () => {
        fireAndForget(queryClient.invalidateQueries({ queryKey: ["apps"] }));
      },
      invalidateApp: (appId) => {
        fireAndForget(
          queryClient.invalidateQueries({ queryKey: ["apps", appId] })
        );
      },
      invalidateVersions: (appId) => {
        fireAndForget(
          queryClient.invalidateQueries({
            queryKey: ["apps", appId, "versions"],
          })
        );
      },
      refreshAttendedApp: (appId) => {
        refreshRef.current?.(appId);
      },
      onLiveVersion: notifyLiveVersion,
    };

    const handleFrame = (frame: OrgServerFrame) => {
      if (frame.kind === "sync") {
        lastSeqRef.current = frame.seq;
        return;
      }
      if (frame.kind === "resync") {
        lastSeqRef.current = frame.toSeq;
        coalesce(() => {
          fireAndForget(
            queryClient.invalidateQueries({
              queryKey: ["apps"],
              type: "active",
            })
          );
        });
        return;
      }
      if (frame.kind === "event") {
        lastSeqRef.current = frame.seq;
        routeOrgEvent(frame, deps);
      }
    };

    const connect = () => {
      if (closed) {
        return;
      }
      const ws = new WebSocket(orgEventsWsUrl());
      socket = ws;

      ws.addEventListener("open", () => {
        if (lastSeqRef.current != null) {
          ws.send(
            JSON.stringify({
              v: 1,
              kind: "resume",
              lastSeq: lastSeqRef.current,
            })
          );
        }
      });

      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (
          !parsed ||
          typeof parsed !== "object" ||
          (parsed as { v?: unknown }).v !== 1
        ) {
          return;
        }
        const kind = (parsed as { kind?: unknown }).kind;
        if (kind === "sync" || kind === "resync" || kind === "event") {
          handleFrame(parsed as OrgServerFrame);
        }
      });

      ws.addEventListener("close", () => {
        if (closed) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
      });

      ws.addEventListener("error", () => {
        ws.close();
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
      }
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
      socket?.close();
    };
  }, [queryClient]);

  return null;
}
