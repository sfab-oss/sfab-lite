import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ShellPageFrame } from "../../components/layout/shell";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { invalidateSession, useSession } from "../../hooks/use-session";
import { authClient } from "../../lib/auth-client";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
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
    <ShellPageFrame items={[{ title: "Settings" }]}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-6 md:py-8">
          {session.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Organization</CardTitle>
                  <CardDescription>
                    Parties and ledger lines belong to this organization.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex max-w-md flex-col gap-4"
                    onSubmit={onSubmit}
                  >
                    <FieldGroup className="gap-4">
                      <Field>
                        <FieldLabel
                          className="text-muted-foreground"
                          htmlFor="org-name"
                        >
                          Name
                        </FieldLabel>
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
                        <FieldLabel
                          className="text-muted-foreground"
                          htmlFor="org-slug"
                        >
                          Slug
                        </FieldLabel>
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
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                    <div className="flex items-center gap-3">
                      <Button disabled={pending || !organization} type="submit">
                        {pending ? "Saving…" : "Save changes"}
                      </Button>
                      {saved ? (
                        <span className="text-muted-foreground text-sm">
                          Saved.
                        </span>
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
            </>
          )}
        </div>
      </div>
    </ShellPageFrame>
  );
}
