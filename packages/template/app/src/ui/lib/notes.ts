import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Calls into the notes API. Kept out of the components so the pages stay
 * about rendering — and so the typed client is used in one place per route.
 */
export const notesQueryOptions = queryOptions({
  queryKey: ["notes"],
  queryFn: async () => {
    const res = await api.api.notes.$get();
    if (!res.ok) {
      throw new Error(`notes ${res.status}`);
    }
    const { notes } = await res.json();
    return notes;
  },
});

export type Note = Awaited<
  ReturnType<NonNullable<typeof notesQueryOptions.queryFn>>
>[number];

export async function createNote(input: { title: string; body: string }) {
  const res = await api.api.notes.$post({ json: input });
  if (!res.ok) {
    throw new Error(`create note ${res.status}`);
  }
  return await res.json();
}

export async function deleteNote(id: string) {
  const res = await api.api.notes[":id"].$delete({ param: { id } });
  if (!res.ok) {
    throw new Error(`delete note ${res.status}`);
  }
  return await res.json();
}
