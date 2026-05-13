import Link from "next/link";
import type { Route } from "next";
import { listBudgets } from "@/server/budgets";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Budgets · Household Finance" };

export default async function BudgetsPage() {
  const session = await requireSession();
  const budgets = await listBudgets();
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Budgets</h1>
          <p className="mt-1 text-muted-foreground">
            Per-month category targets with actuals vs. planned and configurable carry-over.
          </p>
        </div>
        {isAdmin ? (
          <Button asChild>
            <Link href={"/budgets/new" as Route}>New budget</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        {budgets.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No budgets yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-left font-medium">Period</th>
                <th className="px-5 py-3 text-left font-medium">Range</th>
                <th className="px-5 py-3 text-right font-medium">Lines</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/budgets/${b.id}` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {b.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{b.currency}</div>
                  </td>
                  <td className="px-5 py-3 text-xs">{b.periodKind}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {b.startMonth}
                    {b.endMonth ? ` – ${b.endMonth}` : " – open"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{b._count.lines}</td>
                  <td className="px-5 py-3">
                    <Badge variant={b.isActive ? "success" : "outline"}>
                      {b.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
