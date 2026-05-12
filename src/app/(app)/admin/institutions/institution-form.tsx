"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Institution } from "@prisma/client";
import { createInstitutionAction, updateInstitutionAction } from "./actions";

type Props = {
  mode: "create" | "edit";
  institution?: Institution;
  onDone?: () => void;
};

const TYPES = ["BANK", "BROKERAGE", "LENDER", "LEASING_CO", "OTHER"] as const;

export function InstitutionForm({ mode, institution, onDone }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createInstitutionAction(formData)
          : await updateInstitutionAction(institution!.id, formData);
      if (result.ok) {
        if (mode === "create") {
          (document.getElementById("inst-create-form") as HTMLFormElement | null)?.reset();
        }
        onDone?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      id={mode === "create" ? "inst-create-form" : undefined}
      action={submit}
      className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end"
    >
      <div className="space-y-1">
        <Label htmlFor={`${mode}-name`}>Name</Label>
        <Input
          id={`${mode}-name`}
          name="name"
          required
          defaultValue={institution?.name ?? ""}
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${mode}-type`}>Type</Label>
        <Select
          id={`${mode}-type`}
          name="type"
          required
          defaultValue={institution?.type ?? "BANK"}
          disabled={pending}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${mode}-country`}>Country</Label>
        <Input
          id={`${mode}-country`}
          name="country"
          placeholder="CH"
          maxLength={2}
          defaultValue={institution?.country ?? ""}
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${mode}-website`}>Website</Label>
        <Input
          id={`${mode}-website`}
          name="website"
          placeholder="https://…"
          defaultValue={institution?.website ?? ""}
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add" : "Save"}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
