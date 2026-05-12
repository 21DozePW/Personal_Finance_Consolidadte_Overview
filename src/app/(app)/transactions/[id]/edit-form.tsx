"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteTransactionAction, updateTransactionAction } from "../actions";

type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" };

type Txn = {
  id: string;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  postedOn: string | null;
  amountMinor: string; // bigint as string
  categoryId: string | null;
  description: string | null;
  isTransfer: boolean;
  splitGroupId: string | null;
};

function absMajor(minor: string, fractionDigits: number): string {
  const sign = minor.startsWith("-") ? "-" : "";
  const digits = sign ? minor.slice(1) : minor;
  if (fractionDigits === 0) return digits;
  const padded = digits.padStart(fractionDigits + 1, "0");
  const whole = padded.slice(0, padded.length - fractionDigits);
  const frac = padded.slice(padded.length - fractionDigits);
  return `${whole}.${frac}`;
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function EditTransactionForm({
  txn,
  categories,
}: {
  txn: Txn;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fd = ZERO_DECIMAL.has(txn.currency) ? 0 : 2;
  const isNegative = txn.amountMinor.startsWith("-");
  const defaultKind = isNegative ? "EXPENSE" : "INCOME";
  const defaultAmount = absMajor(txn.amountMinor.replace(/^-/, ""), fd);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await updateTransactionAction(txn.id, form);
      if (r.ok) router.push(`/transactions/${txn.id}`);
      else setError(r.error);
    });
  }

  function onDelete() {
    if (!window.confirm("Delete this transaction? Transfers delete both legs.")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTransactionAction(txn.id);
      if (r && !r.ok) setError(r.error);
    });
  }

  const isLocked = txn.isTransfer; // amount and kind locked for transfer legs

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="occurredOn">Date</Label>
          <Input
            id="occurredOn"
            name="occurredOn"
            type="date"
            required
            defaultValue={txn.occurredOn}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postedOn">Posted on (optional)</Label>
          <Input id="postedOn" name="postedOn" type="date" defaultValue={txn.postedOn ?? ""} />
        </div>
        {isLocked ? null : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="kind">Kind</Label>
              <Select id="kind" name="kind" required defaultValue={defaultKind}>
                <option value="EXPENSE">Expense (outflow)</option>
                <option value="INCOME">Income (inflow)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount ({txn.currency})</Label>
              <Input
                id="amount"
                name="amount"
                required
                inputMode="decimal"
                defaultValue={defaultAmount}
              />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" defaultValue={txn.categoryId ?? ""}>
            <option value="">— uncategorized —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind.toLowerCase()})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="merchant">Merchant (optional)</Label>
          <Input id="merchant" name="merchant" maxLength={120} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={txn.description ?? ""}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
        <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>
          Delete
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
