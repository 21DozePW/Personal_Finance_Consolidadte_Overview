"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshFxAction } from "./actions";

export function RefreshFxButton() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setStatus(null);
    setError(null);
    startTransition(async () => {
      const result = await refreshFxAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const s = result.summary;
      if (!s) {
        setStatus("Fetch complete.");
        return;
      }
      setStatus(
        `Fetch ${s.status.toLowerCase()}. Got ${s.fetched.length} (${s.fetched.join(", ") || "—"})` +
          (s.missing.length > 0 ? `, missing ${s.missing.join(", ")}` : ""),
      );
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={onClick} disabled={pending}>
        {pending ? "Fetching…" : "Fetch latest rates now"}
      </Button>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
