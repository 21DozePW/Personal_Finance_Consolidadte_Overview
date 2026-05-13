"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteBudgetLineAction } from "../actions";

export function DeleteLineButton({
  budgetId,
  lineId,
  label,
}: {
  budgetId: string;
  lineId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Remove "${label}" from this month?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteBudgetLineAction(budgetId, lineId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
        {pending ? "…" : "Remove"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
