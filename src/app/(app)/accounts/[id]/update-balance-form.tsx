"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordBalanceAction } from "../actions";

export function UpdateBalanceForm({
  accountId,
  currency,
  todayIso,
}: {
  accountId: string;
  currency: string;
  todayIso: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await recordBalanceAction(accountId, form);
      if (result.ok) {
        setSuccess("Balance saved.");
        (document.getElementById("ub-form") as HTMLFormElement | null)?.reset();
        const dateInput = document.getElementById("ub-date") as HTMLInputElement | null;
        if (dateInput) dateInput.value = todayIso;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form id="ub-form" action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="ub-date">As of</Label>
          <Input
            id="ub-date"
            type="date"
            name="asOfDate"
            required
            defaultValue={todayIso}
            max={todayIso}
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ub-amount">Amount ({currency})</Label>
          <Input
            id="ub-amount"
            name="amount"
            required
            inputMode="decimal"
            placeholder="1234.56"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record balance"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </form>
  );
}
