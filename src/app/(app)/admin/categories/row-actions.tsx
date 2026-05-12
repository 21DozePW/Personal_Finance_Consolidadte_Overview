"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveCategoryAction, deleteCategoryAction, unarchiveCategoryAction } from "./actions";

export function RowActions({
  id,
  name,
  isArchived,
  canDelete,
}: {
  id: string;
  name: string;
  isArchived: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function archive() {
    setError(null);
    startTransition(async () => {
      const r = await archiveCategoryAction(id);
      if (!r.ok) setError(r.error);
    });
  }
  function unarchive() {
    setError(null);
    startTransition(async () => {
      const r = await unarchiveCategoryAction(id);
      if (!r.ok) setError(r.error);
    });
  }
  function remove() {
    if (!window.confirm(`Delete category “${name}”?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteCategoryAction(id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {isArchived ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={unarchive}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={archive}>
            Archive
          </Button>
        )}
        {canDelete ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={remove}>
            Delete
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
