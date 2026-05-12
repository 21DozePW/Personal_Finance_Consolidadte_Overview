"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deactivateAccountAction, deleteAccountAction } from "../actions";

export function AccountAdminActions({
  id,
  alias,
  isActive,
}: {
  id: string;
  alias: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDeactivate() {
    if (!window.confirm(`Mark “${alias}” as closed? You can re-open it later.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateAccountAction(id);
      if (!result.ok) setError(result.error);
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Permanently delete “${alias}”? This only works for accounts with no balances or transactions.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(id);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {isActive ? (
          <Button variant="outline" size="sm" onClick={onDeactivate} disabled={pending}>
            Mark closed
          </Button>
        ) : null}
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
          Delete
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
