import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "../components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import { Input } from "../components/input";
import { Textarea } from "../components/textarea";
import { authClient } from "../lib/auth-client";
import {
  createNote,
  deleteNote,
  type Note,
  notesQueryOptions,
} from "../lib/notes";
import { sessionQueryOptions } from "../lib/session";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-medium text-xl">Notes</h1>
          <p className="text-muted-foreground text-sm">
            {session.data?.organization?.name ?? "Organization"} ·{" "}
            {session.data?.user?.email}
          </p>
        </div>
        <Button onClick={onSignOut} type="button" variant="outline">
          Sign out
        </Button>
      </header>

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
              {create.isPending ? "Saving…" : "Add note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        {notes.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : null}
        {notes.data?.length === 0 ? (
          <p className="text-muted-foreground text-sm">No notes yet.</p>
        ) : null}
        {notes.data?.map((note: Note) => (
          <Card key={note.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{note.title}</CardTitle>
                {note.body ? (
                  <CardDescription className="mt-1 whitespace-pre-wrap">
                    {note.body}
                  </CardDescription>
                ) : null}
              </div>
              <Button
                onClick={() => remove.mutate(note.id)}
                type="button"
                variant="ghost"
              >
                Delete
              </Button>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
