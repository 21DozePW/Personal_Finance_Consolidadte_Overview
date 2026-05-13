"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createScenarioAction, updateScenarioAction } from "./actions";

type LumpSumDefault = { month: string; amount: string; description: string };

type Props =
  | { mode: "create"; defaultStartMonth: string }
  | {
      mode: "edit";
      id: string;
      defaults: {
        name: string;
        isBaseline: boolean;
        startMonth: string;
        horizonMonths: number;
        monthlyIncomeAdjustment: string;
        monthlyExpenseAdjustment: string;
        annualIncomeGrowthPct: string;
        annualExpenseGrowthPct: string;
        annualReturnPct: string;
        lumpSums: LumpSumDefault[];
      };
    };

export function ScenarioForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initialLumps: LumpSumDefault[] =
    props.mode === "edit" && props.defaults.lumpSums.length > 0
      ? props.defaults.lumpSums
      : [{ month: "", amount: "", description: "" }];
  const [lumps, setLumps] = useState<LumpSumDefault[]>(initialLumps);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r =
        props.mode === "create"
          ? await createScenarioAction(form)
          : await updateScenarioAction(props.id, form);
      if (r && !r.ok) setError(r.error);
    });
  }

  const d = props.mode === "edit" ? props.defaults : null;
  const defaultStartMonth = props.mode === "create" ? props.defaultStartMonth : d!.startMonth;

  return (
    <form action={submit} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={d?.name ?? ""}
            placeholder="Baseline 2026"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="isBaseline">Mark as baseline</Label>
          <select
            id="isBaseline"
            name="isBaseline"
            defaultValue={d?.isBaseline ? "true" : "false"}
            disabled={pending}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="false">No</option>
            <option value="true">Yes — this is the baseline</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startMonth">Start month (YYYY-MM)</Label>
          <Input
            id="startMonth"
            name="startMonth"
            required
            pattern="\d{4}-\d{2}"
            defaultValue={defaultStartMonth}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="horizonMonths">Horizon (months)</Label>
          <Input
            id="horizonMonths"
            name="horizonMonths"
            type="number"
            min={1}
            max={120}
            required
            defaultValue={d?.horizonMonths ?? 60}
            disabled={pending}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Monthly deltas (CHF)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="monthlyIncomeAdjustment">Income adjustment / month</Label>
            <Input
              id="monthlyIncomeAdjustment"
              name="monthlyIncomeAdjustment"
              inputMode="decimal"
              placeholder="0"
              defaultValue={d?.monthlyIncomeAdjustment ?? "0"}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthlyExpenseAdjustment">Expense adjustment / month</Label>
            <Input
              id="monthlyExpenseAdjustment"
              name="monthlyExpenseAdjustment"
              inputMode="decimal"
              placeholder="0"
              defaultValue={d?.monthlyExpenseAdjustment ?? "0"}
              disabled={pending}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Annual growth & returns (%)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="annualIncomeGrowthPct">Income growth</Label>
            <Input
              id="annualIncomeGrowthPct"
              name="annualIncomeGrowthPct"
              inputMode="decimal"
              placeholder="3"
              defaultValue={d?.annualIncomeGrowthPct ?? "0"}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="annualExpenseGrowthPct">Expense growth</Label>
            <Input
              id="annualExpenseGrowthPct"
              name="annualExpenseGrowthPct"
              inputMode="decimal"
              placeholder="2"
              defaultValue={d?.annualExpenseGrowthPct ?? "0"}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="annualReturnPct">Expected return on net worth</Label>
            <Input
              id="annualReturnPct"
              name="annualReturnPct"
              inputMode="decimal"
              placeholder="4"
              defaultValue={d?.annualReturnPct ?? "0"}
              disabled={pending}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">One-off lump sums (CHF)</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setLumps((l) => [...l, { month: "", amount: "", description: "" }])}
          >
            + Add line
          </Button>
        </div>
        {lumps.map((l, i) => (
          <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <div className="space-y-1">
              <Label htmlFor={`lump-${i}-month`}>Month</Label>
              <Input
                id={`lump-${i}-month`}
                name={`lump-${i}-month`}
                pattern="\d{4}-\d{2}"
                defaultValue={l.month}
                placeholder="2026-06"
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lump-${i}-amount`}>Amount (CHF)</Label>
              <Input
                id={`lump-${i}-amount`}
                name={`lump-${i}-amount`}
                inputMode="decimal"
                defaultValue={l.amount}
                placeholder="10000 or -5000"
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lump-${i}-description`}>Description (optional)</Label>
              <Input
                id={`lump-${i}-description`}
                name={`lump-${i}-description`}
                maxLength={120}
                defaultValue={l.description}
                disabled={pending}
              />
            </div>
            <div className="flex items-end">
              {lumps.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setLumps((arr) => arr.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create scenario" : "Save"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
