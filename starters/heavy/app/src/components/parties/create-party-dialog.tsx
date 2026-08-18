import { PlusIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useCreateParty } from "../../hooks/use-parties";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  BLANK_PARTY_FORM,
  PartyForm,
  type PartyFormValues,
} from "./party-form";

export function CreatePartyDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PartyFormValues>(BLANK_PARTY_FORM);
  const create = useCreateParty();

  function onSubmit() {
    create.mutate(
      {
        name: form.name,
        kind: form.kind,
        email: form.email.trim() || null,
        taxId: form.taxId.trim() || null,
      },
      {
        onSuccess: () => {
          setForm(BLANK_PARTY_FORM);
          setOpen(false);
        },
      }
    );
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setForm(BLANK_PARTY_FORM);
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="size-4" />
        New party
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New party</DialogTitle>
          <DialogDescription>Someone you charge or pay</DialogDescription>
        </DialogHeader>
        <PartyForm
          onChange={setForm}
          onSubmit={onSubmit}
          pending={create.isPending}
          submitLabel="Create party"
          value={form}
        />
      </DialogContent>
    </Dialog>
  );
}
