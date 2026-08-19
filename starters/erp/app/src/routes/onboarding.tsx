import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "../components/layout/auth-shell";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
import { invalidateSession, loadSession } from "../hooks/use-session";
import { authClient } from "../lib/auth-client";

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

function slugify(value: string): string {
  return value.toLowerCase().replaceAll(NON_SLUG, "-").replace(EDGE_DASHES, "");
}

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session.authenticated) {
      throw redirect({ to: "/sign-in" });
    }
    if (!session.needsOnboarding) {
      throw redirect({ to: "/overview" });
    }
  },
  component: OnboardingPage,
});

const onboardingSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

function OnboardingPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: "", slug: "" },
  });

  async function onSubmit(values: OnboardingValues) {
    setError(null);

    const { data, error: failure } = await authClient.organization.create({
      name: values.name,
      slug: values.slug || slugify(values.name),
    });

    if (failure) {
      setError(failure.message ?? "Could not create organization");
      return;
    }

    if (data?.id) {
      await authClient.organization.setActive({ organizationId: data.id });
    }

    await invalidateSession();
    await navigate({ to: "/overview" });
  }

  return (
    <AuthShell
      heading="Create your organization"
      tagline="Parties and ledger lines are scoped per organization."
    >
      <Card>
        <CardContent className="pt-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FieldGroup className="gap-4">
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      id={field.name}
                      onChange={(event) => {
                        field.onChange(event);
                        if (!form.getFieldState("slug").isDirty) {
                          form.setValue("slug", slugify(event.target.value));
                        }
                      }}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="slug"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      id={field.name}
                    />
                    <FieldDescription>
                      Used in URLs. Lowercase letters, numbers, and dashes.
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? "Creating…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
