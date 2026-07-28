import { BoxesIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AuthCardSkeleton } from "@/components/brand/auth-card-skeleton";
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
  Label,
} from "@/components/ui";
import type { McpConsentContext } from "../api";
import { fetchMcpConsentContext, submitMcpConsent } from "../api";
import { SignInScreen } from "./sign-in";

/**
 * Grant an MCP client access to one organization in this factory.
 *
 * The OAuth provider sends the user here with the entire signed authorization
 * query as this page's query string — `client_id`, `redirect_uri`,
 * `code_challenge`, `state`, `exp`, `sig` and the rest. The signature covers
 * that exact string, so it is read once off the address bar and posted back
 * verbatim; nothing here reassembles it from parsed parameters.
 *
 * Read once on mount rather than per render so a sign-in round trip that
 * rewrites history cannot change what is submitted underneath the user.
 */
export function McpConsentScreen() {
  const [oauthQuery] = useState(() => window.location.search.slice(1));
  const [context, setContext] = useState<McpConsentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchMcpConsentContext()
      .then((next) => {
        setContext(next);
        setLoadError(null);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const params = new URLSearchParams(oauthQuery);
  if (!params.has("sig")) {
    return (
      <ConsentShell>
        <Card>
          <CardHeader>
            <CardTitle>Not an authorization request</CardTitle>
            <CardDescription>
              Open this page from your MCP client, not directly — the signed
              request it needs is missing.
            </CardDescription>
          </CardHeader>
        </Card>
      </ConsentShell>
    );
  }

  if (loading) {
    return (
      <ConsentShell>
        <AuthCardSkeleton />
      </ConsentShell>
    );
  }

  if (loadError) {
    return (
      <ConsentShell>
        <Alert variant="destructive">
          <AlertTitle>Could not load this request</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </ConsentShell>
    );
  }

  if (!context) {
    return (
      <SignInScreen
        destination={{
          // A full page navigation, so the signed query has to survive in the
          // URL — the in-memory copy above does not come back from GitHub.
          callbackURL: `/mcp/consent${window.location.search}`,
          onSignedIn: load,
        }}
      />
    );
  }

  return (
    <ConsentShell>
      <ConsentCard
        clientId={params.get("client_id") ?? ""}
        context={context}
        oauthQuery={oauthQuery}
        scope={params.get("scope") ?? ""}
      />
    </ConsentShell>
  );
}

function ConsentCard({
  context,
  oauthQuery,
  clientId,
  scope,
}: {
  context: McpConsentContext;
  oauthQuery: string;
  clientId: string;
  scope: string;
}) {
  const [selected, setSelected] = useState(
    () => context.organizations[0]?.id ?? null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    if (accept && !selected) {
      setError("Choose an organization first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      window.location.href = await submitMcpConsent({
        oauthQuery,
        // Denial writes no grant, so the value is unused — but the field is
        // required, and sending the selection keeps one shape on the wire.
        organizationId: selected ?? "none",
        accept,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorize MCP client</CardTitle>
        <CardDescription>
          Signed in as {context.user.name} ({context.user.email}).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {clientId ? <Detail label="Client">{clientId}</Detail> : null}
        {scope ? <Detail label="Requested access">{scope}</Detail> : null}

        <OrganizationChoice
          onSelect={setSelected}
          organizations={context.organizations}
          selected={selected}
        />

        <p className="text-muted-foreground text-xs leading-relaxed">
          This client will be able to read and change apps in the chosen
          organization, and to deploy them. It cannot reach any other
          organization; authorize it again to use a different one.
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Authorization failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy || !selected}
            onClick={() => answer(true)}
            type="button"
          >
            {busy ? "Working…" : "Authorize"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => answer(false)}
            type="button"
            variant="outline"
          >
            Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationChoice({
  organizations,
  selected,
  onSelect,
}: {
  organizations: McpConsentContext["organizations"];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (organizations.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No organization to authorize</AlertTitle>
        <AlertDescription>
          This account does not belong to one, so there is nothing a token could
          act on.
        </AlertDescription>
      </Alert>
    );
  }
  if (organizations.length === 1) {
    return <Detail label="Organization">{organizations[0]?.name}</Detail>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground text-xs">Organization</Label>
      {organizations.map((org) => (
        <Button
          className="justify-start"
          key={org.id}
          onClick={() => onSelect(org.id)}
          type="button"
          variant={org.id === selected ? "default" : "outline"}
        >
          {org.name}
        </Button>
      ))}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="break-all rounded-md border bg-muted/30 px-3 py-2 text-sm">
        {children}
      </div>
    </div>
  );
}

function ConsentShell({ children }: { children: ReactNode }) {
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
