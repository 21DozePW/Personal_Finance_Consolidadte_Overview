import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/server/auth-guards";
import { getDashboardData } from "@/server/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY } from "@/lib/fx";

export const metadata = { title: "Dashboard · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });
const monthFmt = new Intl.DateTimeFormat("en-CH", { month: "long", year: "numeric" });

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await getDashboardData();
  const monthLabel = monthFmt.format(new Date(`${data.cashFlow.monthLabel}-01T00:00:00Z`));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {session.user.name ?? session.user.email}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Everything you own, owe, owe to yourself, and need to pay this month — in CHF.
        </p>
      </div>

      {data.alerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>Things worth a glance before you keep scrolling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.map((a, i) => (
              <div
                key={i}
                className={
                  "rounded-md border px-3 py-2 text-sm " +
                  (a.level === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : a.level === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-700")
                }
              >
                {a.message}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Net worth"
          value={formatMoney(data.netWorthChfMinor, BASE_CURRENCY)}
          emphasis
          positive={data.netWorthChfMinor >= 0}
        />
        <Stat label="Assets" value={formatMoney(data.assetsChfMinor, BASE_CURRENCY)} positive />
        <Stat
          label="Liabilities"
          value={formatMoney(data.liabilitiesChfMinor, BASE_CURRENCY)}
          negative
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow · {monthLabel}</CardTitle>
          <CardDescription>
            Income vs. expenses from recurring commitments scheduled in {monthLabel}. Ad-hoc
            transactions track separately on the{" "}
            <Link href={"/transactions" as Route} className="underline-offset-4 hover:underline">
              Transactions
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm tabular-nums sm:grid-cols-3">
          <SmallStat
            label="Income"
            value={formatMoney(data.cashFlow.incomeChfMinor, BASE_CURRENCY)}
            positive
          />
          <SmallStat
            label="Expenses"
            value={formatMoney(data.cashFlow.expenseChfMinor, BASE_CURRENCY)}
            negative
          />
          <SmallStat
            label="Net"
            value={formatMoney(data.cashFlow.netChfMinor, BASE_CURRENCY)}
            positive={data.cashFlow.netChfMinor >= 0}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top goals</CardTitle>
            <CardDescription>
              Highest-priority active goals.{" "}
              <Link href={"/goals" as Route} className="underline-offset-4 hover:underline">
                See all →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.topGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active goals yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.topGoals.map((g) => (
                  <li key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        href={`/goals/${g.id}` as Route}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {g.name}
                      </Link>
                      <Badge variant={g.progress.onTrack ? "success" : "warning"}>
                        {(g.progress.pctComplete * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.max(0, Math.min(1, g.progress.pctComplete)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {formatMoney(g.derivedCurrentMinor, g.currency)} of{" "}
                        {formatMoney(g.targetAmountMinor, g.currency)}
                      </span>
                      <span>{g.progress.monthsRemaining}mo left</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming (next 30 days)</CardTitle>
            <CardDescription>
              Scheduled commitments from{" "}
              <Link href={"/recurring" as Route} className="underline-offset-4 hover:underline">
                recurring
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.upcoming.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                Nothing scheduled in the next 30 days.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-y uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Due</th>
                    <th className="px-5 py-2 text-left font-medium">Name</th>
                    <th className="px-5 py-2 text-right font-medium">Amount</th>
                    <th className="px-5 py-2 text-right font-medium">≈ {BASE_CURRENCY}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming.map((o, i) => {
                    const income = o.kind === "INCOME";
                    return (
                      <tr key={`${o.commitmentId}-${i}`} className="border-b last:border-b-0">
                        <td className="px-5 py-2 text-muted-foreground">
                          {dateFmt.format(o.dueDate)}
                        </td>
                        <td className="px-5 py-2">
                          {o.name}
                          <div className="text-[10px] text-muted-foreground">{o.accountAlias}</div>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  positive,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            (emphasis ? "text-3xl " : "text-xl ") +
            "tabular-nums" +
            (positive ? "text-emerald-700" : negative ? "text-destructive" : "")
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
