"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createRecurringAction, updateRecurringAction } from "./actions";

type AccountOption = { id: string; alias: string; currency: string };
type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE" | "TRANSFER" };

type Props =
  | { mode: "create"; accounts: AccountOption[]; categories: CategoryOption[]; todayIso: string }
  | {
      mode: "edit";
      id: string;
      accounts: AccountOption[];
      categories: CategoryOption[];
      todayIso: string;
      defaults: {
        name: string;
        accountId: string;
        categoryId: string;
        amount: string;
        cadence: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL" | "CUSTOM";
        kind: "INCOME" | "EXPENSE" | "LOAN_PAYMENT" | "LEASE_PAYMENT" | "SUBSCRIPTION";
        dayRule: string;
        nextDueDate: string;
        endDate: string;
        notes: string;
      };
      managedByLoanTerms: boolean;
    };

export function RecurringForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r =
        props.mode === "create"
          ? await createRecurringAction(form)
          : await updateRecurringAction(props.id, form);
      if (r && !r.ok) setError(r.error);
    });
  }

  const d = props.mode === "edit" ? props.defaults : null;

  return (
    <form action={submit} className="space-y-5">
      {props.mode === "edit" && props.managedByLoanTerms ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          This row was auto-generated from the account&rsquo;s loan terms. Edits stick until the
          next time you save loan terms, which re-syncs the row.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={d?.name ?? ""}
            placeholder="Salary, Spotify, Mortgage payment, …"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select
            id="accountId"
            name="accountId"
            required
            defaultValue={d?.accountId ?? props.accounts[0]?.id ?? ""}
            disabled={pending}
          >
            <option value="" disabled>
              Select…
            </option>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias} ({a.currency})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Category</Label>
          <Select
            id="categoryId"
            name="categoryId"
            defaultValue={d?.categoryId ?? ""}
            disabled={pending}
          >
            <option value="">— uncategorized —</option>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind.toLowerCase()})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={d?.amount ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select
            id="kind"
            name="kind"
            required
            defaultValue={d?.kind ?? "EXPENSE"}
            disabled={pending}
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="LOAN_PAYMENT">Loan payment</option>
            <option value="LEASE_PAYMENT">Lease payment</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadence">Cadence</Label>
          <Select
            id="cadence"
            name="cadence"
            required
            defaultValue={d?.cadence ?? "MONTHLY"}
            disabled={pending}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annual</option>
            <option value="CUSTOM">Custom (not auto-projected)</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dayRule">Day rule (informational)</Label>
          <Input
            id="dayRule"
            name="dayRule"
            placeholder="day 1, last business day, …"
            defaultValue={d?.dayRule ?? ""}
            maxLength={60}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nextDueDate">Next due date</Label>
          <Input
            id="nextDueDate"
            name="nextDueDate"
            type="date"
            required
            defaultValue={d?.nextDueDate ?? props.todayIso}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">End date (optional)</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={d?.endDate ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (encrypted)</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={d?.notes ?? ""}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create" : "Save"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
