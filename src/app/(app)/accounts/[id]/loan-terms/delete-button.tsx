"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteLoanTermsAction } from "./actions";

export function DeleteLoanTermsButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm("Delete these loan terms? The linked recurring payment will be removed too.")
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteLoanTermsAction(accountId);
      if (!r.ok) setError(r.error);
      else router.push(`/accounts/${accountId}`);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
        {pending ? "Deleting…" : "Delete loan terms"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
