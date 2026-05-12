"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { overrideFxAction } from "./actions";

export function OverrideFxForm({
  currencies,
  todayIso,
}: {
  currencies: string[];
  todayIso: string;
}) {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setSuccess(null);
    setError(null);
    startTransition(async () => {
      const result = await overrideFxAction(form);
      if (result.ok) {
        setSuccess("Rate saved.");
        (document.getElementById("override-form") as HTMLFormElement | null)?.reset();
        const dateInput = document.getElementById("override-date") as HTMLInputElement | null;
        if (dateInput) dateInput.value = todayIso;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form id="override-form" action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="override-quote">Quote currency</Label>
          <Input
            id="override-quote"
            name="quoteCurrency"
            list="override-quote-list"
            required
            maxLength={3}
            placeholder="USD"
            disabled={pending}
          />
          <datalist id="override-quote-list">
            {currencies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="override-rate">Rate (1 CHF =)</Label>
          <Input
            id="override-rate"
            name="rate"
            required
            inputMode="decimal"
            placeholder="1.0987"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="override-date">As of</Label>
          <Input
            id="override-date"
            name="asOfDate"
            type="date"
            required
            defaultValue={todayIso}
            max={todayIso}
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save override"}
        </Button>
      </div>
      {success ? <p className="text-xs text-emerald-700">{success}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
