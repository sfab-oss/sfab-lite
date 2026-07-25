import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { AuthConfig } from "../api";
import { fetchAuthConfig } from "../api";
import { authClient } from "../auth-client";
import { useRouter } from "../router";

export function SignInScreen() {
  const { navigate } = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAuthConfig()
      .then((c) => {
        if (!cancelled) {
          setConfig(c);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setConfigError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionPending && session?.user) {
      navigate({ name: "apps" }, true);
    }
  }, [session, sessionPending, navigate]);

  if (sessionPending || !(config || configError)) {
    return (
      <Shell>
        <p className="text-[var(--muted)]">Loading…</p>
      </Shell>
    );
  }

  if (configError) {
    return (
      <Shell>
        <p className="text-[var(--danger)]">Could not load sign-in config.</p>
        <p className="mt-2 text-[var(--muted)] text-sm">{configError}</p>
      </Shell>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <Shell>
      <h1 className="m-0 font-semibold text-2xl tracking-tight">Sign in</h1>
      <p className="mt-2 text-[var(--muted)] text-sm">
        Factory console — manage apps for your organization.
      </p>
      <SignInBody
        config={config}
        onSignedIn={() => navigate({ name: "apps" }, true)}
      />
    </Shell>
  );
}

function SignInBody({
  config,
  onSignedIn,
}: {
  config: AuthConfig;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noMethods = !(config.passwordAuth || config.githubAuth);
  if (noMethods) {
    return <NoAuthConfigured />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const authError = await runPasswordAuth(mode, {
        email,
        password,
        name,
      });
      if (authError) {
        setError(authError);
        return;
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGitHub() {
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/apps",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex max-w-sm flex-col gap-4">
      {config.githubAuth ? (
        <button
          type="button"
          disabled={busy}
          onClick={onGitHub}
          className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left hover:border-[var(--ink)] disabled:opacity-50"
        >
          Continue with GitHub
        </button>
      ) : null}

      {config.passwordAuth && config.githubAuth ? (
        <p className="m-0 text-center text-[var(--muted)] text-xs">or</p>
      ) : null}

      {config.passwordAuth ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === "signup" ? (
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="border border-[var(--line)] bg-white px-2 py-1.5"
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="border border-[var(--line)] bg-white px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              className="border border-[var(--line)] bg-white px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-white disabled:opacity-50"
          >
            {submitLabel(busy, mode)}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="border-0 bg-transparent p-0 text-left text-[var(--accent)] text-sm underline"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="m-0 text-[var(--danger)] text-sm">{error}</p>
      ) : null}
    </div>
  );
}

async function runPasswordAuth(
  mode: "signin" | "signup",
  input: { email: string; password: string; name: string }
): Promise<string | null> {
  if (mode === "signup") {
    const result = await authClient.signUp.email({
      email: input.email,
      password: input.password,
      name: input.name.trim() || input.email.split("@")[0] || "User",
    });
    return result.error ? (result.error.message ?? "sign-up failed") : null;
  }
  const result = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  });
  return result.error ? (result.error.message ?? "sign-in failed") : null;
}

function NoAuthConfigured() {
  return (
    <div className="mt-8 border border-[var(--danger)] bg-[#fff5f5] p-4">
      <p className="m-0 font-medium text-[var(--danger)]">
        No sign-in method configured on this deploy
      </p>
      <p className="mt-2 mb-0 text-[var(--muted)] text-sm">
        Set <code>PASSWORD_AUTH=true</code> (local) and/or both{" "}
        <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code>{" "}
        (production). Until then there is no way to authenticate.
      </p>
    </div>
  );
}

function submitLabel(busy: boolean, mode: "signin" | "signup"): string {
  if (busy) {
    return "Working…";
  }
  return mode === "signup" ? "Create account" : "Sign in";
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <p className="m-0 mb-8 font-medium text-[var(--muted)] text-sm uppercase tracking-wide">
        sfab-lite
      </p>
      {children}
    </main>
  );
}
