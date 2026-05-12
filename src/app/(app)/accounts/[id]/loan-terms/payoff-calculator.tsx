"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAmountToMinor, ParseAmountError, formatMoney } from "@/lib/money";
import { payoffWithExtra } from "@/lib/amortization";

export function PayoffCalculator({
  currency,
  remainingBalanceMinor,
  interestRatePctBps,
  baselinePaymentMinor,
}: {
  currency: string;
  remainingBalanceMinor: number;
  interestRatePctBps: number;
  baselinePaymentMinor: number;
}) {
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState<ReturnType<typeof payoffWithExtra> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate() {
    setError(null);
    setResult(null);
    if (!extra.trim()) {
      setError("Enter an amount.");
      return;
    }
    let extraMinor: bigint;
    try {
      extraMinor = parseAmountToMinor(extra, currency);
    } catch (err) {
      if (err instanceof ParseAmountError) {
        setError(err.message);
        return;
      }
      throw err;
    }
    if (extraMinor < 0n) {
      setError("Use a positive number.");
      return;
    }
    setResult(
      payoffWithExtra({
        remainingBalanceMinor,
        interestRatePctBps,
        baselinePaymentMinor,
        extraMinor: Number(extraMinor),
      }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="extraAmount">Extra payment / month ({currency})</Label>
          <Input
            id="extraAmount"
            inputMode="decimal"
            placeholder="500"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
        <Button type="button" onClick={calculate}>
          Calculate
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? <ResultPanel currency={currency} result={result} /> : null}
    </div>
  );
}

function ResultPanel({
  currency,
  result,
}: {
  currency: string;
  result: ReturnType<typeof payoffWithExtra>;
}) {
  const baselineMonths = isFinite(result.baseline.months) ? result.baseline.months : "∞";
  const extraMonths = isFinite(result.withExtra.months) ? result.withExtra.months : "∞";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Months saved" value={`${result.monthsSaved}`} />
      <Stat
        label="Interest saved"
        value={
          isFinite(result.interestSavedMinor)
            ? formatMoney(result.interestSavedMinor, currency)
            : "—"
        }
      />
      <Stat label={`Months: baseline → with extra`} value={`${baselineMonths} → ${extraMonths}`} />
      <div className="text-xs text-muted-foreground sm:col-span-3">
        Total interest baseline:{" "}
        {isFinite(result.baseline.totalInterestMinor)
          ? formatMoney(result.baseline.totalInterestMinor, currency)
          : "∞"}
        {" · "}with extra:{" "}
        {isFinite(result.withExtra.totalInterestMinor)
          ? formatMoney(result.withExtra.totalInterestMinor, currency)
          : "∞"}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
