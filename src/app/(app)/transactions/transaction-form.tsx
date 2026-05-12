"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSingleTransactionAction, createSplitAction, createTransferAction } from "./actions";

type AccountOption = { id: string; alias: string; currency: string };
type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" };

type Props = {
  accounts: AccountOption[];
  categories: CategoryOption[];
  todayIso: string;
};

type Mode = "single" | "transfer" | "split";

export function TransactionForm({ accounts, categories, todayIso }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("single");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [splitLines, setSplitLines] = useState<number>(2);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      if (mode === "single") {
        const r = await createSingleTransactionAction(form);
        if (r.ok) router.push(`/transactions/${r.data.id}`);
        else setError(r.error);
      } else if (mode === "transfer") {
        const r = await createTransferAction(form);
        if (r.ok) router.push(`/transactions/${r.data.fromId}`);
        else setError(r.error);
      } else {
        const r = await createSplitAction(form);
        if (r.ok) router.push(`/transactions/${r.data.id}`);
        else setError(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 text-sm">
        {(["single", "transfer", "split"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              "rounded-md border px-3 py-1.5 transition-colors " +
              (mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent")
            }
          >
            {m === "single" ? "Single" : m === "transfer" ? "Transfer" : "Split"}
          </button>
        ))}
      </div>

      <form action={submit} className="space-y-5">
        {mode === "single" ? (
          <SingleFields accounts={accounts} categories={categories} todayIso={todayIso} />
        ) : null}
        {mode === "transfer" ? <TransferFields accounts={accounts} todayIso={todayIso} /> : null}
        {mode === "split" ? (
          <SplitFields
            accounts={accounts}
            categories={categories}
            todayIso={todayIso}
            lines={splitLines}
            onAddLine={() => setSplitLines((n) => n + 1)}
            onRemoveLine={() => setSplitLines((n) => Math.max(2, n - 1))}
          />
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
            Cancel
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function SingleFields({ accounts, categories, todayIso }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Account" htmlFor="accountId">
        <Select id="accountId" name="accountId" required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.alias} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date" htmlFor="occurredOn">
        <Input id="occurredOn" name="occurredOn" type="date" required defaultValue={todayIso} />
      </Field>
      <Field label="Kind" htmlFor="kind">
        <Select id="kind" name="kind" required defaultValue="EXPENSE">
          <option value="EXPENSE">Expense (outflow)</option>
          <option value="INCOME">Income (inflow)</option>
        </Select>
      </Field>
      <Field label="Amount" htmlFor="amount">
        <Input id="amount" name="amount" required inputMode="decimal" placeholder="0.00" />
      </Field>
      <Field label="Category" htmlFor="categoryId">
        <Select id="categoryId" name="categoryId" defaultValue="">
          <option value="">— uncategorized —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.kind.toLowerCase()})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Merchant (optional)" htmlFor="merchant">
        <Input id="merchant" name="merchant" maxLength={120} />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={2} maxLength={500} />
      </Field>
      <Field label="Posted on (optional)" htmlFor="postedOn">
        <Input id="postedOn" name="postedOn" type="date" />
      </Field>
    </div>
  );
}

function TransferFields({ accounts, todayIso }: { accounts: AccountOption[]; todayIso: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="From account" htmlFor="fromAccountId">
        <Select id="fromAccountId" name="fromAccountId" required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.alias} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To account" htmlFor="toAccountId">
        <Select id="toAccountId" name="toAccountId" required defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.alias} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From amount" htmlFor="fromAmount">
        <Input id="fromAmount" name="fromAmount" required inputMode="decimal" placeholder="0.00" />
      </Field>
      <Field label="To amount" htmlFor="toAmount">
        <Input id="toAmount" name="toAmount" required inputMode="decimal" placeholder="0.00" />
      </Field>
      <Field label="Date" htmlFor="occurredOn">
        <Input id="occurredOn" name="occurredOn" type="date" required defaultValue={todayIso} />
      </Field>
      <Field label="Posted on (optional)" htmlFor="postedOn">
        <Input id="postedOn" name="postedOn" type="date" />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={2} maxLength={500} />
      </Field>
    </div>
  );
}

function SplitFields({
  accounts,
  categories,
  todayIso,
  lines,
  onAddLine,
  onRemoveLine,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  todayIso: string;
  lines: number;
  onAddLine: () => void;
  onRemoveLine: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account" htmlFor="accountId">
          <Select id="accountId" name="accountId" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="occurredOn">
          <Input id="occurredOn" name="occurredOn" type="date" required defaultValue={todayIso} />
        </Field>
        <Field label="Merchant (optional)" htmlFor="merchant">
          <Input id="merchant" name="merchant" maxLength={120} />
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={2} maxLength={500} />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Split lines</h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onAddLine}>
              + Add line
            </Button>
            {lines > 2 ? (
              <Button type="button" size="sm" variant="outline" onClick={onRemoveLine}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label={`Line ${i + 1} category`} htmlFor={`line-${i}-categoryId`}>
              <Select id={`line-${i}-categoryId`} name={`line-${i}-categoryId`} defaultValue="">
                <option value="">— uncategorized —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kind" htmlFor={`line-${i}-kind`}>
              <Select id={`line-${i}-kind`} name={`line-${i}-kind`} defaultValue="EXPENSE">
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </Select>
            </Field>
            <Field label="Amount" htmlFor={`line-${i}-amount`}>
              <Input
                id={`line-${i}-amount`}
                name={`line-${i}-amount`}
                required
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>
        ))}
      </div>
    </div>
  );
}
