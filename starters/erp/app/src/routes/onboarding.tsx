import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthShell } from "../components/layout/auth-shell";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
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
    await navigate({ to: "/parties" });
  }

  return (
    <AuthShell
      heading="Create your organization"
      tagline="Parties and ledger lines are scoped per organization."
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
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <Button disabled={pending} type="submit">
              {pending ? "Creating…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
