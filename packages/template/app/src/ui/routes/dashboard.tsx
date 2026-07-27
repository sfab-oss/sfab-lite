import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Avatar, AvatarFallback } from "../components/avatar";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/empty";
import { Input } from "../components/input";
import { Separator } from "../components/separator";
import { Skeleton } from "../components/skeleton";
import { Spinner } from "../components/spinner";
import { Textarea } from "../components/textarea";
import { authClient } from "../lib/auth-client";
import {
  createNote,
  deleteNote,
  type Note,
  notesQueryOptions,
} from "../lib/notes";
import { sessionQueryOptions } from "../lib/session";

const WHITESPACE = /\s+/;

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(WHITESPACE).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions);
  const notes = useQuery(notesQueryOptions);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const invalidateNotes = () =>
    queryClient.invalidateQueries({ queryKey: notesQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: createNote,
    onSuccess: async () => {
      setTitle("");
      setBody("");
      await invalidateNotes();
    },
  });

  const remove = useMutation({
    mutationFn: deleteNote,
    onSuccess: invalidateNotes,
  });

  async function onSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/sign-in" });
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate({ title, body });
  }

  const userName = session.data?.user?.name;
  const userEmail = session.data?.user?.email;
  const orgName = session.data?.organization?.name ?? "Organization";

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-medium text-xl">Notes</h1>
            <Badge variant="secondary">{orgName}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">{userEmail}</p>
        </div>
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback>{initials(userName, userEmail)}</AvatarFallback>
          </Avatar>
          <Button onClick={onSignOut} type="button" variant="outline">
            Sign out
          </Button>
        </div>
      </header>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>New note</CardTitle>
          <CardDescription>Per-organization demo CRUD</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onCreate}>
            <Input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title"
              required
              value={title}
            />
            <Textarea
              onChange={(event) => setBody(event.target.value)}
              placeholder="Body"
              value={body}
            />
            <Button disabled={create.isPending || !title.trim()} type="submit">
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {create.isPending ? "Saving…" : "Add note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        {notes.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {!notes.isLoading && notes.data?.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </EmptyMedia>
              <EmptyTitle>No notes yet</EmptyTitle>
              <EmptyDescription>
                Add a note above to get started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {notes.data?.map((note: Note) => (
          <Card key={note.id}>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
              {note.body ? (
                <CardDescription className="mt-1 whitespace-pre-wrap">
                  {note.body}
                </CardDescription>
              ) : null}
              <CardAction>
                <Button
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(note.id)}
                  type="button"
                  variant="ghost"
                >
                  Delete
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
