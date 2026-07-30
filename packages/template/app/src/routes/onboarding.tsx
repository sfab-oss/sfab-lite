import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthShell } from "../components/layout/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { invalidateSession } from "../hooks/use-session";
import { authClient } from "../lib/auth-client";

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

function slugify(value: string): string {
  return value.toLowerCase().replaceAll(NON_SLUG, "-").replace(EDGE_DASHES, "");
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Tracked explicitly rather than inferred from an empty `slug`: the slug is
  // non-empty after one keystroke, which would freeze it at a single letter.
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { data, error: failure } = await authClient.organization.create({
      name,
      slug: slug || slugify(name),
    });

    if (failure) {
      setPending(false);
      setError(failure.message ?? "Could not create organization");
      return;
    }

    if (data?.id) {
      await authClient.organization.setActive({ organizationId: data.id });
    }

    await invalidateSession();
    setPending(false);
    await navigate({ to: "/documents" });
  }

  return (
    <AuthShell
      heading="Create your organization"
      tagline="Parties, catalog, and documents are scoped per organization."
    >
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="org-name">Name</FieldLabel>
                <Input
                  id="org-name"
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugEdited) {
                      setSlug(slugify(event.target.value));
                    }
                  }}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="org-slug">Slug</FieldLabel>
                <Input
                  id="org-slug"
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value);
                  }}
                  required
                  value={slug}
                />
                <FieldDescription>
                  Used in URLs. Lowercase letters, numbers, and dashes.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not create organization</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={pending} type="submit">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Creating…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
