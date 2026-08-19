import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "../components/layout/auth-shell";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
import { invalidateSession } from "../hooks/use-session";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

type SignInValues = z.infer<typeof signInSchema>;

function SignInPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setError(null);

    const { error: failure } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });

    if (failure) {
      setError(failure.message ?? "Sign-in failed");
      return;
    }

    await invalidateSession();
    await navigate({ to: "/overview" });
  }

  return (
    <AuthShell heading="sfab-lite" tagline="Sign in to continue">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FieldGroup className="gap-4">
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      autoComplete="email"
                      id={field.name}
                      type="email"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      {...field}
                      aria-invalid={fieldState.invalid}
                      autoComplete="current-password"
                      id={field.name}
                      type="password"
                    />
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
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-muted-foreground text-sm">
            No account?{" "}
            <Link className="underline underline-offset-4" to="/sign-up">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
