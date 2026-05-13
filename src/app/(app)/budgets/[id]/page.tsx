import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getBudget, getBudgetSummary, listBudgetLines } from "@/server/budgets";
import { listCategories } from "@/server/categories";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { LineForm } from "./line-form";
import { CopyMonthForm } from "./copy-form";
import { DeleteLineButton } from "./delete-line-button";

export const metadata = { title: "Budget · Household Finance" };

type SearchParams = { month?: string };

export default async function BudgetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const budget = await getBudget(id);
  if (!budget) notFound();

  const summary = await getBudgetSummary(id);
  const isAdmin = session.user.role === "ADMIN";

  // Pick the month to display: ?month=YYYY-MM, else current month, else last in summary.
  const today = new Date();
  const thisMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const availableMonths = summary.map((s) => s.month);
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : availableMonths.includes(thisMonth)
        ? thisMonth
        : (availableMonths[availableMonths.length - 1] ?? thisMonth);

  const focused = summary.find((s) => s.month === month);
  const categories = await listCategories({ includeArchived: false });
  const linesForMonth = await listBudgetLines(id, month);
  const usedCategoryIds = new Set(linesForMonth.map((l) => l.categoryId));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{budget.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{budget.currency}</Badge>
            <Badge variant="outline">{budget.periodKind}</Badge>
            <Badge variant={budget.isActive ? "success" : "destructive"}>
              {budget.isActive ? "Active" : "Inactive"}
            </Badge>
            <span className="text-muted-foreground">
              {budget.startMonth}
              {budget.endMonth ? ` – ${budget.endMonth}` : " – open"}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Month</CardTitle>
          <CardDescription>
            Pick the month to inspect. Carry-over rules accumulate across months in the order lines
            were configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {availableMonths.length === 0 ? (
              <span className="text-muted-foreground">
                No lines yet — add the first one below for {thisMonth}.
              </span>
            ) : (
              availableMonths.map((m) => (
                <Link
                  key={m}
                  href={`/budgets/${id}?month=${m}` as Route}
                  className={
                    "rounded-md border px-3 py-1 " +
                    (m === month
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent")
                  }
                >
                  {m}
                </Link>
              ))
            )}
            <Link
              href={`/budgets/${id}?month=${thisMonth}` as Route}
              className="rounded-md border px-3 py-1 text-xs hover:bg-accent"
            >
              This month ({thisMonth})
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Planned"
          valueMinor={focused?.totalPlannedMinor ?? 0}
          currency={budget.currency}
        />
        <Stat
          label="Actual"
          valueMinor={focused?.totalActualMinor ?? 0}
          currency={budget.currency}
        />
        <Stat
          label="Variance"
          valueMinor={focused?.totalVarianceMinor ?? 0}
          currency={budget.currency}
          emphasis
          positive={(focused?.totalVarianceMinor ?? 0) >= 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{month} · variance by category</CardTitle>
          <CardDescription>
            Actual is the absolute amount transacted in the month, converted to {budget.currency}{" "}
            via each transaction&rsquo;s captured rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!focused || focused.rows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No lines for {month} yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Category</th>
                  <th className="px-5 py-2 text-right font-medium">Planned</th>
                  <th className="px-5 py-2 text-right font-medium">Carry-in</th>
                  <th className="px-5 py-2 text-right font-medium">Effective</th>
                  <th className="px-5 py-2 text-right font-medium">Actual</th>
                  <th className="px-5 py-2 text-right font-medium">Variance</th>
                  <th className="px-5 py-2 text-left font-medium">Rule</th>
                  {isAdmin ? <th className="px-5 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {focused.rows.map((row) => {
                  const line = linesForMonth.find((l) => l.categoryId === row.categoryId);
                  return (
                    <tr key={row.categoryId} className="border-b last:border-b-0">
                      <td className="px-5 py-2">
                        {row.categoryName}
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {row.categoryKind}
                        </Badge>
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {formatMoney(row.plannedMinor, budget.currency)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">
                        {row.carriedInMinor === 0
                          ? "—"
                          : formatMoney(row.carriedInMinor, budget.currency)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {formatMoney(row.effectivePlannedMinor, budget.currency)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {formatMoney(row.actualMinor, budget.currency)}
                      </td>
                      <td
                        className={`px-5 py-2 text-right font-medium tabular-nums ${
                          row.varianceMinor >= 0 ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {formatMoney(row.varianceMinor, budget.currency)}
                      </td>
                      <td className="px-5 py-2 text-xs">
                        {row.carryOverRule.toLowerCase().replace("_", " ")}
                      </td>
                      {isAdmin && line ? (
                        <td className="px-5 py-2 text-right">
                          <DeleteLineButton
                            budgetId={id}
                            lineId={line.id}
                            label={row.categoryName}
                          />
                        </td>
                      ) : isAdmin ? (
                        <td />
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Add / update a line for {month}</CardTitle>
            <CardDescription>
              Picking a category already on the list updates its planned amount.{" "}
              {usedCategoryIds.size} of {categories.length} categories used so far.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LineForm
              budgetId={id}
              month={month}
              currency={budget.currency}
              categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Copy from a prior month</CardTitle>
            <CardDescription>
              Replicates every line from the source month into {month}. Already-present lines are
              overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyMonthForm budgetId={id} currentMonth={month} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  valueMinor,
  currency,
  emphasis,
  positive,
}: {
  label: string;
  valueMinor: number;
  currency: string;
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
          {formatMoney(valueMinor, currency)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
