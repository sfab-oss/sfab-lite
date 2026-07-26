import { useAgentChat } from "@cloudflare/think/react";
import { useAgent } from "agents/react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function newThreadId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function messageText(message: {
  parts?: Array<{ type: string; text?: string }>;
}): string {
  if (!message.parts) {
    return "";
  }
  return message.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("");
}

function AgentSession({
  appId,
  threadId,
}: {
  appId: string;
  threadId: string;
}) {
  const name = `${appId}:${threadId}`;
  const agent = useAgent({ agent: "AppThread", name });
  const { messages, status, sendMessage, stop } = useAgentChat({ agent });
  const [draft, setDraft] = useState("");
  const [inspect, setInspect] = useState<string>("");
  const busy = status === "submitted" || status === "streaming";

  const onInspect = useCallback(() => {
    agent
      .call("inspectWorkspace", [])
      .then((result) => setInspect(JSON.stringify(result, null, 2)))
      .catch((error: unknown) => {
        setInspect(
          error instanceof Error ? error.message : JSON.stringify(error)
        );
      });
  }, [agent]);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    setDraft("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] }).catch(
      (error: unknown) => {
        console.error("[dev-agent] sendMessage failed", error);
      }
    );
  }, [busy, draft, sendMessage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        agent <code className="text-foreground">AppThread</code> ·{" "}
        <code className="text-foreground">{name}</code> · status {status}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onInspect}>
          Inspect workspace
        </Button>
      </div>
      {inspect ? (
        <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2 text-muted-foreground text-xs">
          {inspect}
        </pre>
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ask about the app source — e.g. what files are here, or what the
            Hono router does. The agent should list/grep/read the workspace.
          </p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {message.role}
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-foreground text-sm">
              {messageText(message) || "(no text parts — see tool calls in WS)"}
            </pre>
            {"parts" in message && Array.isArray(message.parts)
              ? message.parts
                  .filter((p) => p.type !== "text")
                  .map((part, i) => (
                    <pre
                      // biome-ignore lint/suspicious/noArrayIndexKey: transient tool parts
                      key={`${message.id}-part-${i}`}
                      className="overflow-x-auto rounded bg-background p-2 text-muted-foreground text-xs"
                    >
                      {JSON.stringify(part, null, 2)}
                    </pre>
                  ))
              : null}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the agent…"
          className="min-h-20 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={onSend}
            disabled={busy || !draft.trim()}
          >
            Send
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stop().catch((error: unknown) => {
                console.error("[dev-agent] stop failed", error);
              });
            }}
            disabled={!busy}
          >
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * DEV-only harness for S4.1 — proves Think + workspace seeding. Replaced by
 * the real chat UI in S4.3. Gated by `import.meta.env.DEV` at the router.
 */
export function DevAgentScreen() {
  const [appIdInput, setAppIdInput] = useState("");
  const [session, setSession] = useState<{
    appId: string;
    threadId: string;
  } | null>(null);

  const canStart = useMemo(
    () => appIdInput.trim().startsWith("app_"),
    [appIdInput]
  );

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-foreground text-xl">
          /dev/agent — Think substrate
        </h1>
        <p className="text-muted-foreground text-sm">
          Scratch harness. Pick a live app id, open a thread, chat against its
          seeded workspace. Not shipped in production builds.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground" id="dev-agent-app-id-label">
            App id
          </span>
          <Input
            value={appIdInput}
            onChange={(e) => setAppIdInput(e.target.value)}
            placeholder="app_…"
            disabled={session !== null}
            aria-labelledby="dev-agent-app-id-label"
          />
        </div>
        {session ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setSession(null)}
          >
            Reset thread
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!canStart}
            onClick={() =>
              setSession({
                appId: appIdInput.trim(),
                threadId: newThreadId(),
              })
            }
          >
            Open thread
          </Button>
        )}
      </div>

      {session ? (
        <AgentSession appId={session.appId} threadId={session.threadId} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Create an app from the console (or use an existing{" "}
          <code className="text-foreground">app_…</code> id), then open a thread
          here.
        </p>
      )}
    </main>
  );
}
