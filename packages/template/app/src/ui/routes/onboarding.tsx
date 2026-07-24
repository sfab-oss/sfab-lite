import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthShell } from "../components/auth-shell";
import { Button } from "../components/button";
import { Card, CardContent } from "../components/card";
import { Field } from "../components/field";
import { authClient } from "../lib/auth-client";
import { invalidateSession } from "../lib/session";

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
    await navigate({ to: "/app" });
  }

  return (
    <AuthShell
      heading="Create your organization"
      tagline="Notes and data are scoped per organization."
    >
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <Field
              id="org-name"
              label="Name"
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) {
                  setSlug(slugify(event.target.value));
                }
              }}
              required
              value={name}
            />
            <Field
              id="org-slug"
              label="Slug"
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              required
              value={slug}
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <Button disabled={pending} type="submit">
              {pending ? "Creating…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
