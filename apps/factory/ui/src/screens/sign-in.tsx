import { BoxesIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from "@/components/ui";
import type { AuthConfig } from "../api";
import { fetchAuthConfig } from "../api";
import { authClient } from "../auth-client";
import { useRouter } from "../router";

type AuthMode = "signin" | "signup";

/**
 * The console's sign-in screen, and the sign-in step of any flow that has
 * somewhere else to be afterwards.
 *
 * `destination` is what makes it reusable: the MCP consent screen needs the
 * user returned to the signed authorization query they arrived with, not sent
 * to the console. Left out, it behaves exactly as the standalone screen always
 * did — including bouncing an already-signed-in visitor away, which a caller
 * that renders this *because* nobody is signed in must not inherit.
 */
export interface SignInDestination {
  /** Where GitHub's round trip lands. Must survive a full page navigation. */
  callbackURL: string;
  /** Called after an in-page (password) sign-in succeeds. */
  onSignedIn: () => void;
}

export function SignInScreen({
  destination,
}: {
  destination?: SignInDestination;
}) {
  const { navigate } = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  // Lives here rather than in `SignInBody` because the heading above the form
  // has to name the same action the form performs.
  const [mode, setMode] = useState<AuthMode>("signin");

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
    if (!(destination || sessionPending) && session?.user) {
      navigate({ name: "chat" }, true);
    }
  }, [session, sessionPending, navigate, destination]);

  if (sessionPending || !(config || configError)) {
    return (
      <AuthShell>
        <p className="text-center text-muted-foreground text-sm">Loading…</p>
      </AuthShell>
    );
  }

  if (configError) {
    return (
      <AuthShell>
        <Alert variant="destructive">
          <AlertTitle>Could not load sign-in config.</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <AuthShell>
      <Card>
        {/* Heading follows the form below it — a "Sign in" title over a
            create-account form misnames what the button will do. */}
        <CardHeader>
          <CardTitle>
            {mode === "signup" ? "Create account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            Factory console — manage apps for your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInBody
            config={config}
            githubCallbackURL={destination?.callbackURL ?? "/apps"}
            mode={mode}
            onSignedIn={
              destination?.onSignedIn ??
              (() => navigate({ name: "chat" }, true))
            }
            setMode={setMode}
          />
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function SignInBody({
  config,
  mode,
  setMode,
  onSignedIn,
  githubCallbackURL,
}: {
  config: AuthConfig;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onSignedIn: () => void;
  githubCallbackURL: string;
}) {
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
        callbackURL: githubCallbackURL,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {config.githubAuth ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={onGitHub}
        >
          Continue with GitHub
        </Button>
      ) : null}

      {config.passwordAuth && config.githubAuth ? (
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
      ) : null}

      {config.passwordAuth ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "signup" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="auth-name">Name</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Ana Torres"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {submitLabel(busy, mode)}
          </Button>
          {/* Hidden, not disabled, when registration is closed: the sign-up
              request would fail at the end of a form the user already filled
              in, and `EMAIL_PASSWORD_SIGN_UP_DISABLED` does not explain why. */}
          {config.signUpAvailable ? (
            <p className="text-center text-muted-foreground text-sm">
              {mode === "signin"
                ? "Need an account? "
                : "Already have an account? "}
              <Button
                type="button"
                variant="link"
                disabled={busy}
                className="h-auto p-0 text-brand"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </Button>
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

async function runPasswordAuth(
  mode: AuthMode,
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
    <Alert variant="destructive">
      <AlertTitle>No sign-in method configured on this deploy</AlertTitle>
      <AlertDescription>
        <p>
          Set <code>PASSWORD_AUTH=true</code> (local) and/or both{" "}
          <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code>{" "}
          (production). Until then there is no way to authenticate.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function submitLabel(busy: boolean, mode: AuthMode): string {
  if (busy) {
    return "Working…";
  }
  return mode === "signup" ? "Create account" : "Sign in";
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <div className="flex items-center gap-2 font-semibold text-lg">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BoxesIcon className="size-5" />
        </div>
        sfab-lite
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
