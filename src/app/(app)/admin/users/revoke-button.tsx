"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeAllowedEmailAction } from "./actions";

export function RevokeButton({ id, email }: { id: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(`Revoke access for ${email}? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeAllowedEmailAction(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
