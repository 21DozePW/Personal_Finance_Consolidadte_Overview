"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLoanTermsAction, updateLoanTermsAction } from "./actions";

type Props =
  | { mode: "create"; accountId: string; currency: string }
  | {
      mode: "edit";
      accountId: string;
      currency: string;
      defaults: {
        principal: string;
        interestRatePct: string;
        termMonths: number;
        startDate: string;
        paymentDayOfMonth: number;
        monthlyPaymentOverride: string;
        remainingBalance: string;
      };
    };

export function LoanTermsForm(props: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r =
        props.mode === "create"
          ? await createLoanTermsAction(props.accountId, form)
          : await updateLoanTermsAction(props.accountId, form);
      if (r && !r.ok) setError(r.error);
    });
  }

  const d = props.mode === "edit" ? props.defaults : null;

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="principal">Principal ({props.currency})</Label>
          <Input
            id="principal"
            name="principal"
            required
            inputMode="decimal"
            placeholder="500000"
            defaultValue={d?.principal ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interestRatePct">Annual interest rate (%)</Label>
          <Input
            id="interestRatePct"
            name="interestRatePct"
            required
            inputMode="decimal"
            placeholder="4.25"
            defaultValue={d?.interestRatePct ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="termMonths">Term (months)</Label>
          <Input
            id="termMonths"
            name="termMonths"
            type="number"
            min={1}
            max={1200}
            required
            placeholder="240"
            defaultValue={d?.termMonths ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentDayOfMonth">Payment day of month</Label>
          <Input
            id="paymentDayOfMonth"
            name="paymentDayOfMonth"
            type="number"
            min={1}
            max={31}
            required
            placeholder="1"
            defaultValue={d?.paymentDayOfMonth ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={d?.startDate ?? ""}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monthlyPaymentOverride">
            Monthly payment override ({props.currency}, optional)
          </Label>
          <Input
            id="monthlyPaymentOverride"
            name="monthlyPaymentOverride"
            inputMode="decimal"
            placeholder="leave blank to derive from PMT"
            defaultValue={d?.monthlyPaymentOverride ?? ""}
            disabled={pending}
          />
        </div>
        {props.mode === "edit" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="remainingBalance">Current remaining balance ({props.currency})</Label>
            <Input
              id="remainingBalance"
              name="remainingBalance"
              inputMode="decimal"
              defaultValue={d?.remainingBalance ?? ""}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Used by the payoff calculator and audit log. Recorded payments will update this in
              future phases.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create loan terms" : "Save"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
