"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteGoalAction, refreshGoalAction } from "../actions";

export function RefreshGoalButton({
  id,
  hasLinkedAccount,
}: {
  id: string;
  hasLinkedAccount: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const r = await refreshGoalAction(id);
      if (!r.ok) setError(r.error);
    });
  }
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending || !hasLinkedAccount}
        title={
          hasLinkedAccount
            ? "Snapshot the linked account's current balance"
            : "Link an account first"
        }
      >
        {pending ? "Refreshing…" : "Refresh from account"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function DeleteGoalButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteGoalAction(id);
      if (r && !r.ok) setError(r.error);
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
