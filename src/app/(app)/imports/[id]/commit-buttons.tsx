"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelImportAction, commitImportAction, revertImportAction } from "../actions";

export function PendingActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    setError(null);
    startTransition(async () => {
      const r = await commitImportAction(id);
      if (!r.ok) setError(r.error);
    });
  }
  function cancel() {
    if (!window.confirm("Discard this pending import?")) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelImportAction(id);
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button onClick={commit} disabled={pending}>
          {pending ? "Committing…" : "Commit import"}
        </Button>
        <Button variant="outline" onClick={cancel} disabled={pending}>
          Discard
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function RevertButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function onClick() {
    if (
      !window.confirm(
        "Revert this import? Every transaction it created will be permanently deleted.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await revertImportAction(id);
      if (!r.ok) setError(r.error);
    });
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="destructive" onClick={onClick} disabled={pending}>
        {pending ? "Reverting…" : "Revert import"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
