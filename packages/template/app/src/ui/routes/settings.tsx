import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../components/alert";
import { AppShell } from "../components/app-shell";
import { Button } from "../components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import { Field, FieldGroup, FieldLabel } from "../components/field";
import { Input } from "../components/input";
import { Spinner } from "../components/spinner";
import { authClient } from "../lib/auth-client";
import { invalidateSession, sessionQueryOptions } from "../lib/session";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions);
  const organization = session.data?.organization;

  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // Null until first edit so the field follows the loaded organization
  // instead of freezing whatever was in the cache on first render.
  const value = name ?? organization?.name ?? "";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!organization) {
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);

    const { error: failure } = await authClient.organization.update({
      organizationId: organization.id,
      data: { name: value },
    });

    setPending(false);
    if (failure) {
      setError(failure.message ?? "Could not save changes");
      return;
    }

    await invalidateSession();
    await queryClient.invalidateQueries();
    setSaved(true);
  }

  return (
    <AppShell title="Settings">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Parties, catalog, and documents all belong to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-md flex-col gap-4" onSubmit={onSubmit}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="org-name">Name</FieldLabel>
                <Input
                  id="org-name"
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                  required
                  value={value}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-slug">Slug</FieldLabel>
                <Input
                  disabled
                  id="org-slug"
                  readOnly
                  value={organization?.slug ?? ""}
                />
              </Field>
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not save changes</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center gap-3">
              <Button disabled={pending || !organization} type="submit">
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {pending ? "Saving…" : "Save changes"}
              </Button>
              {saved ? (
                <span className="text-muted-foreground text-sm">Saved.</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>The signed-in user.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <span>{session.data?.user?.name}</span>
          <span className="text-muted-foreground">
            {session.data?.user?.email}
          </span>
        </CardContent>
      </Card>
    </AppShell>
  );
}
