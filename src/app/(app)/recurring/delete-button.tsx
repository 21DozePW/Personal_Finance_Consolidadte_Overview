"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteRecurringAction } from "./actions";

export function DeleteRecurringButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteRecurringAction(id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
        {pending ? "…" : "Delete"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
