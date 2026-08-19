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
import { PartyForm } from "./party-form";

export function CreatePartyDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const create = useCreateParty();

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormKey((key) => key + 1);
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
          key={formKey}
          onSubmit={(values) => {
            create.mutate(
              {
                name: values.name,
                kind: values.kind,
                email: values.email,
                taxId: values.taxId,
              },
              {
                onSuccess: () => {
                  setFormKey((key) => key + 1);
                  setOpen(false);
                },
              }
            );
          }}
          pending={create.isPending}
          submitLabel="Create party"
        />
      </DialogContent>
    </Dialog>
  );
}
