import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ShellPageFrame } from "../../components/layout/shell";
import { ThemeToggle } from "../../components/theme-toggle";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { invalidateSession, useSession } from "../../hooks/use-session";
import { authClient } from "../../lib/auth-client";
import { type Theme, useTheme } from "../../lib/theme";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const orgNameSchema = z.object({
  name: z.string().min(1).max(200),
});

type OrgNameValues = z.infer<typeof orgNameSchema>;

function SettingsPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const organization = session.data?.organization;

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<OrgNameValues>({
    resolver: zodResolver(orgNameSchema),
    defaultValues: { name: organization?.name ?? "" },
  });

  useEffect(() => {
    if (organization?.name != null) {
      form.reset({ name: organization.name });
    }
  }, [organization?.name, form.reset]);

  async function onSubmit(values: OrgNameValues) {
    if (!organization) {
      return;
    }
    setError(null);
    setSaved(false);

    const { error: failure } = await authClient.organization.update({
      organizationId: organization.id,
      data: { name: values.name },
    });

    if (failure) {
      setError(failure.message ?? "Could not save changes");
      return;
    }

    await invalidateSession();
    await queryClient.invalidateQueries();
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
                    onSubmit={form.handleSubmit(onSubmit)}
                  >
                    <FieldGroup className="gap-4">
                      <Controller
                        control={form.control}
                        name="name"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel
                              className="text-muted-foreground"
                              htmlFor={field.name}
                            >
                              Name
                            </FieldLabel>
                            <Input
                              {...field}
                              aria-invalid={fieldState.invalid}
                              id={field.name}
                              onChange={(event) => {
                                field.onChange(event);
                                setSaved(false);
                              }}
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
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
                      <Button
                        disabled={form.formState.isSubmitting || !organization}
                        type="submit"
                      >
                        {form.formState.isSubmitting
                          ? "Saving…"
                          : "Save changes"}
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
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                      Light, dark, or follow the system preference.
                    </CardDescription>
                  </div>
                  <ThemeToggle />
                </CardHeader>
                <CardContent>
                  <AppearanceControls />
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

const APPEARANCE_MODES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function AppearanceControls() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-wrap gap-2">
      {APPEARANCE_MODES.map((mode) => (
        <Button
          key={mode.value}
          onClick={() => setTheme(mode.value)}
          type="button"
          variant={theme === mode.value ? "default" : "outline"}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  );
}
