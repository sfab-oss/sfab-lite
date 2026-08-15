import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { invalidateSession, useSession } from "../hooks/use-session";
import { authClient } from "../lib/auth-client";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const organization = session.data?.organization;

  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

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
    setName(null);
    setSaved(true);
  }

  return (
    <AppShell title="Settings">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Parties and ledger lines belong to this organization.
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
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button disabled={pending || !organization} type="submit">
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
