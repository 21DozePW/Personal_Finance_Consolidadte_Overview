"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createGoalAction, updateGoalAction } from "./actions";

type AccountOption = { id: string; alias: string; currency: string };

type Props =
  | { mode: "create"; accounts: AccountOption[]; todayIso: string }
  | {
      mode: "edit";
      id: string;
      accounts: AccountOption[];
      todayIso: string;
      defaults: {
        name: string;
        kind: "SAVINGS" | "DEBT_PAYOFF" | "EMERGENCY_FUND" | "OTHER";
        currency: string;
        targetAmount: string;
        targetDate: string;
        linkedAccountId: string;
        currentAmount: string;
        monthlyContribution: string;
        priority: number;
        isArchived: boolean;
      };
    };

export function GoalForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r =
        props.mode === "create"
          ? await createGoalAction(form)
          : await updateGoalAction(props.id, form);
      if (r && !r.ok) setError(r.error);
    });
  }

  const d = props.mode === "edit" ? props.defaults : null;

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={d?.name ?? ""}
            placeholder="Italy 2027, Emergency fund, …"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select
            id="kind"
            name="kind"
            required
            defaultValue={d?.kind ?? "SAVINGS"}
            disabled={pending}
          >
            <option value="SAVINGS">Savings</option>
            <option value="DEBT_PAYOFF">Debt payoff</option>
            <option value="EMERGENCY_FUND">Emergency fund</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            required
            maxLength={3}
            defaultValue={d?.currency ?? "CHF"}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetAmount">Target amount</Label>
          <Input
            id="targetAmount"
            name="targetAmount"
            required
            inputMode="decimal"
            placeholder="10000"
            defaultValue={d?.targetAmount ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetDate">Target date</Label>
          <Input
            id="targetDate"
            name="targetDate"
            type="date"
            required
            defaultValue={d?.targetDate ?? props.todayIso}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="linkedAccountId">Linked account (optional)</Label>
          <Select
            id="linkedAccountId"
            name="linkedAccountId"
            defaultValue={d?.linkedAccountId ?? ""}
            disabled={pending}
          >
            <option value="">— none —</option>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias} ({a.currency})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monthlyContribution">Planned monthly contribution (optional)</Label>
          <Input
            id="monthlyContribution"
            name="monthlyContribution"
            inputMode="decimal"
            placeholder="500"
            defaultValue={d?.monthlyContribution ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currentAmount">Current amount (optional, overrides linked)</Label>
          <Input
            id="currentAmount"
            name="currentAmount"
            inputMode="decimal"
            placeholder="0"
            defaultValue={d?.currentAmount ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority (higher = more important)</Label>
          <Input
            id="priority"
            name="priority"
            type="number"
            min={0}
            max={1000}
            step={1}
            defaultValue={d?.priority ?? 0}
            disabled={pending}
          />
        </div>
        {props.mode === "edit" ? (
          <div className="space-y-1.5">
            <Label htmlFor="isArchived">Status</Label>
            <Select
              id="isArchived"
              name="isArchived"
              defaultValue={d?.isArchived ? "true" : "false"}
              disabled={pending}
            >
              <option value="false">Active</option>
              <option value="true">Archived</option>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create goal" : "Save"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
