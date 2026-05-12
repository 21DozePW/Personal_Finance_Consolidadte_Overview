"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createCategoryAction } from "./actions";

type TopLevel = { id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" };

export function CategoryForm({ parents }: { parents: TopLevel[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCategoryAction(form);
      if (result.ok) {
        (document.getElementById("cat-form") as HTMLFormElement | null)?.reset();
        setKind("EXPENSE");
      } else {
        setError(result.error);
      }
    });
  }

  const eligibleParents = parents.filter((p) => p.kind === kind);

  return (
    <form
      id="cat-form"
      action={submit}
      className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end"
    >
      <div className="space-y-1">
        <Label htmlFor="cat-name">Name</Label>
        <Input id="cat-name" name="name" required maxLength={80} disabled={pending} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cat-kind">Kind</Label>
        <Select
          id="cat-kind"
          name="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          disabled={pending}
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
          <option value="TRANSFER">Transfer</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cat-parent">Parent (optional)</Label>
        <Select id="cat-parent" name="parentCategoryId" defaultValue="" disabled={pending}>
          <option value="">— top level —</option>
          {eligibleParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
