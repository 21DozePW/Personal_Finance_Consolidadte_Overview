"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteInstitutionAction } from "./actions";

export function DeleteInstitutionButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Delete institution “${name}”?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteInstitutionAction(id);
      if (!result.ok) setError(result.error);
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
