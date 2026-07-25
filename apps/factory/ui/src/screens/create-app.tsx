import { type FormEvent, useState } from "react";
import { AuthRequiredError, createApp } from "../api";
import { endUnusableSession } from "../auth-client";
import { Link, useRouter } from "../router";
import { ConsoleChrome } from "./chrome";

export function CreateAppScreen() {
  const { navigate } = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { appId } = await createApp(trimmed);
      navigate({ name: "app", appId });
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        await endUnusableSession();
        navigate({ name: "sign-in" }, true);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <ConsoleChrome title="New app">
      <p className="mt-0 text-[var(--muted-foreground)] text-sm">
        Creates a registry row and seeds the starter template. The request
        returns immediately; the app stays <code>creating</code> while check
        runs, then becomes <code>ready</code> on its own.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-app"
            className="border border-[var(--line)] bg-white px-2 py-1.5"
            disabled={busy}
          />
        </label>
        {error ? (
          <p className="m-0 text-[var(--danger)] text-sm">{error}</p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
          <Link
            to={{ name: "chat" }}
            className="border border-[var(--line)] px-3 py-2 text-[var(--ink)] no-underline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </ConsoleChrome>
  );
}
