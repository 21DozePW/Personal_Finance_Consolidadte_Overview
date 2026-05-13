import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getScenarioProjection } from "@/server/scenarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY } from "@/lib/fx";
import { FORECAST_MILESTONES } from "@/lib/forecast";
import { DeleteScenarioButton } from "./delete-button";

export const metadata = { title: "Scenario · Household Finance" };

const monthFmt = new Intl.DateTimeFormat("en-CH", { month: "short", year: "numeric" });

export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  let projection;
  try {
    projection = await getScenarioProjection(id);
  } catch {
    notFound();
  }
  if (!projection) notFound();
  const { scenario, result, milestones, startingNetWorthChfMinor } = projection;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{scenario.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={scenario.isBaseline ? "success" : "outline"}>
              {scenario.isBaseline ? "Baseline" : "Scenario"}
            </Badge>
            <Badge variant="secondary">{BASE_CURRENCY}</Badge>
            <span className="text-muted-foreground">{result.rows.length}-month projection</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/forecasts/${id}/edit` as Route}>Edit</Link>
          </Button>
          <DeleteScenarioButton id={id} name={scenario.name} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Starting net worth"
          value={formatMoney(startingNetWorthChfMinor, BASE_CURRENCY)}
        />
        {FORECAST_MILESTONES.map((m) => {
          const row = milestones[m];
          const ending = row ? row.endingNetWorthMinor : null;
          return (
            <Stat
              key={m}
              label={`${m / 12}-year (${m}mo)`}
              value={ending == null ? "—" : formatMoney(ending, BASE_CURRENCY)}
              positive={ending == null ? undefined : ending >= startingNetWorthChfMinor}
              emphasis
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cumulative totals over horizon</CardTitle>
          <CardDescription>
            Sum of income, expenses, lump sums, and returns applied to your net worth.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm tabular-nums sm:grid-cols-4">
          <SmallStat
            label="Income"
            value={formatMoney(result.totalIncomeMinor, BASE_CURRENCY)}
            positive
          />
          <SmallStat
            label="Expenses"
            value={formatMoney(result.totalExpensesMinor, BASE_CURRENCY)}
            negative
          />
          <SmallStat
            label="Lump sums"
            value={formatMoney(result.totalLumpSumMinor, BASE_CURRENCY)}
          />
          <SmallStat
            label="Returns"
            value={formatMoney(result.totalReturnMinor, BASE_CURRENCY)}
            positive
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly projection</CardTitle>
          <CardDescription>
            Starting net worth + monthly cashflow + applied return = ending net worth.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-y bg-card uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Month</th>
                  <th className="px-5 py-2 text-right font-medium">Income</th>
                  <th className="px-5 py-2 text-right font-medium">Expenses</th>
                  <th className="px-5 py-2 text-right font-medium">Lump</th>
                  <th className="px-5 py-2 text-right font-medium">Net</th>
                  <th className="px-5 py-2 text-right font-medium">Return</th>
                  <th className="px-5 py-2 text-right font-medium">End</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const date = new Date(`${row.month}-01T00:00:00Z`);
                  return (
                    <tr key={row.month} className="border-b last:border-b-0">
                      <td className="px-5 py-1.5">{monthFmt.format(date)}</td>
                      <td className="px-5 py-1.5 text-right tabular-nums text-emerald-700">
                        {formatMoney(row.incomeMinor, BASE_CURRENCY)}
                      </td>
                      <td className="px-5 py-1.5 text-right tabular-nums text-destructive">
                        {formatMoney(row.expenseMinor, BASE_CURRENCY)}
                      </td>
                      <td className="px-5 py-1.5 text-right tabular-nums">
                        {formatMoney(row.lumpSumMinor, BASE_CURRENCY)}
                      </td>
                      <td
                        className={`px-5 py-1.5 text-right font-medium tabular-nums ${
                          row.netMinor >= 0 ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {formatMoney(row.netMinor, BASE_CURRENCY)}
                      </td>
                      <td className="px-5 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.returnMinor, BASE_CURRENCY)}
                      </td>
                      <td className="px-5 py-1.5 text-right font-medium tabular-nums">
                        {formatMoney(row.endingNetWorthMinor, BASE_CURRENCY)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  positive,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            (emphasis ? "text-2xl " : "text-lg ") +
            "tabular-nums" +
            (positive === undefined ? "" : positive ? "text-emerald-700" : "text-destructive")
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function SmallStat({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 font-medium " + (positive ? "text-emerald-700" : negative ? "text-destructive" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
