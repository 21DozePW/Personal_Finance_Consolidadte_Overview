"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyMonthAction } from "../actions";

export function CopyMonthForm({
  budgetId,
  currentMonth,
}: {
  budgetId: string;
  currentMonth: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setStatus(null);
    setError(null);
    startTransition(async () => {
      const r = await copyMonthAction(budgetId, form);
      if (r.ok) setStatus(`Copied ${r.data.copied} line(s).`);
      else setError(r.error);
    });
  }

  const prev = prevMonth(currentMonth);
  const prevYear = priorYear(currentMonth);

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="toMonth" value={currentMonth} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="fromMonth">Copy from</Label>
          <Input
            id="fromMonth"
            name="fromMonth"
            required
            defaultValue={prev}
            pattern="\d{4}-\d{2}"
          />
        </div>
        <Button type="submit" disabled={pending} variant="outline">
          {pending ? "Copying…" : `Copy → ${currentMonth}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            const input = document.getElementById("fromMonth") as HTMLInputElement | null;
            if (input) input.value = prevYear;
          }}
        >
          Use prev year
        </Button>
      </div>
      {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function priorYear(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return `${y - 1}-${String(mo).padStart(2, "0")}`;
}
