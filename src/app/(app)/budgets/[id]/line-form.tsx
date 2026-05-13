"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { upsertBudgetLineAction } from "../actions";

export function LineForm({
  budgetId,
  month,
  categories,
  currency,
}: {
  budgetId: string;
  month: string;
  categories: Array<{ id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" }>;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await upsertBudgetLineAction(budgetId, form);
      if (r.ok) {
        (document.getElementById("line-form") as HTMLFormElement | null)?.reset();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form id="line-form" action={submit} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {categories
              .filter((c) => c.kind !== "TRANSFER")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind.toLowerCase()})
                </option>
              ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plannedAmount">Planned ({currency})</Label>
          <Input
            id="plannedAmount"
            name="plannedAmount"
            required
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="carryOverRule">Carry-over</Label>
          <Select id="carryOverRule" name="carryOverRule" defaultValue="RESET">
            <option value="RESET">Reset</option>
            <option value="ROLLOVER_SURPLUS">Rollover surplus</option>
            <option value="ACCUMULATE">Accumulate</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add / update"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
