import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../components/alert";
import { AuthShell } from "../components/auth-shell";
import { Button } from "../components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../components/field";
import { Input } from "../components/input";
import { Spinner } from "../components/spinner";
import { authClient } from "../lib/auth-client";
import { invalidateSession } from "../lib/session";

export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: failure } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    setPending(false);
    if (failure) {
      setError(failure.message ?? "Sign-up failed");
      return;
    }

    await invalidateSession();
    await navigate({ to: "/onboarding" });
  }

  return (
    <AuthShell heading="sfab-lite" tagline="Create an account">
      <Card>
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  autoComplete="name"
                  id="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  autoComplete="email"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-up failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={pending} type="submit">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link className="underline underline-offset-4" to="/sign-in">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
