import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/server/auth-guards";
import { listProjectable } from "@/server/recurring";
import { listAccounts } from "@/server/accounts";
import { getLatestRateLookup } from "@/server/fx";
import { projectCashFlow } from "@/lib/cash-flow";
import { BASE_CURRENCY } from "@/lib/fx";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Cash flow · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });
const monthFmt = new Intl.DateTimeFormat("en-CH", { month: "short", year: "numeric" });

export default async function CashFlowPage() {
  await requireSession();
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [commitments, accounts] = await Promise.all([
    listProjectable(),
    listAccounts({ includeInactive: true }),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const currencies = Array.from(new Set(commitments.map((c) => c.currency)));
  const rateLookup = await getLatestRateLookup(currencies);
  const projection = projectCashFlow(commitments, { from, months: 12, rateLookup });

  // Calendar slice: occurrences within the next 30 days.
  const horizon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcoming = projection.occurrences.filter((o) => o.dueDate >= today && o.dueDate <= horizon);

  const totalIncome = projection.months.reduce((s, m) => s + m.incomeChfMinor, 0);
  const totalExpense = projection.months.reduce((s, m) => s + m.expenseChfMinor, 0);
  const totalNet = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cash flow</h1>
          <p className="mt-1 text-muted-foreground">
            12-month forward projection from recurring commitments, plus a 30-day calendar. Amounts
            are converted to {BASE_CURRENCY} with the latest available FX rate.
          </p>
        </div>
        <Link href={"/recurring" as Route} className="text-sm underline-offset-4 hover:underline">
          Manage recurring →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="12-month income" valueMinor={totalIncome} positive />
        <SummaryCard label="12-month expenses" valueMinor={totalExpense} />
        <SummaryCard label="12-month net" valueMinor={totalNet} emphasis positive={totalNet >= 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>12-month projection ({BASE_CURRENCY})</CardTitle>
          <CardDescription>
            Per-month income, expenses, and net based on every recurring commitment&rsquo;s cadence.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <table className="w-full text-sm">
            <thead className="border-y text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Month</th>
                <th className="px-5 py-2 text-right font-medium">Income</th>
                <th className="px-5 py-2 text-right font-medium">Expenses</th>
                <th className="px-5 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {projection.months.map((m) => {
                const date = new Date(`${m.month}-01T00:00:00Z`);
                return (
                  <tr key={m.month} className="border-b last:border-b-0">
                    <td className="px-5 py-2">{monthFmt.format(date)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-emerald-700">
                      {formatMoney(m.incomeChfMinor, BASE_CURRENCY)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-destructive">
                      {formatMoney(m.expenseChfMinor, BASE_CURRENCY)}
                    </td>
                    <td
                      className={`px-5 py-2 text-right font-medium tabular-nums ${
                        m.netChfMinor >= 0 ? "text-emerald-700" : "text-destructive"
                      }`}
                    >
                      {formatMoney(m.netChfMinor, BASE_CURRENCY)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next 30 days</CardTitle>
          <CardDescription>
            Calendar of scheduled commitments through {dateFmt.format(horizon)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {upcoming.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              Nothing scheduled in the next 30 days.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Due</th>
                  <th className="px-5 py-2 text-left font-medium">Name</th>
                  <th className="px-5 py-2 text-left font-medium">Account</th>
                  <th className="px-5 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 text-right font-medium">≈ {BASE_CURRENCY}</th>
                  <th className="px-5 py-2 text-left font-medium">Kind</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((o, i) => {
                  const acc = accountMap.get(o.accountId);
                  const income = o.kind === "INCOME";
                  return (
                    <tr key={`${o.commitmentId}-${i}`} className="border-b last:border-b-0">
                      <td className="px-5 py-2 text-xs">{dateFmt.format(o.dueDate)}</td>
                      <td className="px-5 py-2">{o.name}</td>
                      <td className="px-5 py-2 text-xs">
                        {acc ? acc.alias : o.accountId}
                        <div className="text-muted-foreground">{o.currency}</div>
                      </td>
                      <td
                        className={`px-5 py-2 text-right tabular-nums ${
                          income ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {income ? "+" : "−"}
                        {formatMoney(o.amountMinor, o.currency)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">
                        {o.chfMinor == null
                          ? "—"
                          : `${income ? "+" : "−"}${formatMoney(o.chfMinor, BASE_CURRENCY)}`}
                      </td>
                      <td className="px-5 py-2">
                        <Badge variant={income ? "success" : "secondary"}>{o.kind}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  valueMinor,
  emphasis,
  positive,
}: {
  label: string;
  valueMinor: number;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            (emphasis ? "text-2xl " : "text-xl ") +
            "tabular-nums" +
            (positive === undefined ? "" : positive ? "text-emerald-700" : "text-destructive")
          }
        >
          {formatMoney(valueMinor, BASE_CURRENCY)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
