"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteScenarioAction } from "../actions";

export function DeleteScenarioButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Delete scenario "${name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteScenarioAction(id);
      if (r && !r.ok) setError(r.error);
    });
  }
  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
