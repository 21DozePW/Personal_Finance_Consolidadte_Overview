"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createBudgetAction } from "../actions";

export function NewBudgetForm({ defaultStartMonth }: { defaultStartMonth: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createBudgetAction(form);
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            placeholder="2026 Household"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            required
            defaultValue="CHF"
            maxLength={3}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodKind">Period</Label>
          <Select id="periodKind" name="periodKind" defaultValue="MONTHLY" disabled={pending}>
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annual</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startMonth">Start month (YYYY-MM)</Label>
          <Input
            id="startMonth"
            name="startMonth"
            required
            placeholder="2026-01"
            defaultValue={defaultStartMonth}
            pattern="\d{4}-\d{2}"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endMonth">End month (optional)</Label>
          <Input
            id="endMonth"
            name="endMonth"
            placeholder="2026-12"
            pattern="\d{4}-\d{2}"
            disabled={pending}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create budget"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
