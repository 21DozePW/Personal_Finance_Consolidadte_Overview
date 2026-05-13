import Link from "next/link";
import type { Route } from "next";
import { listScenarios } from "@/server/scenarios";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Forecasts · Household Finance" };

const datetimeFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" });

export default async function ForecastsPage() {
  await requireSession();
  const scenarios = await listScenarios();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Forecast scenarios</h1>
          <p className="mt-1 text-muted-foreground">
            What-if projections of net worth over the next 1, 3, and 5 years. Each scenario layers
            assumption deltas (income / expense adjustments, growth %, returns, one-off lump sums)
            on top of your recurring commitments.
          </p>
        </div>
        <div className="flex gap-2">
          {scenarios.length >= 2 ? (
            <Button asChild variant="outline">
              <Link href={"/forecasts/compare" as Route}>Compare</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={"/forecasts/new" as Route}>New scenario</Link>
          </Button>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-muted-foreground">No scenarios yet.</p>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-left font-medium">Type</th>
                <th className="px-5 py-3 text-left font-medium">Updated</th>
                <th className="px-5 py-3 text-left font-medium">Created by</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/forecasts/${s.id}` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {s.isBaseline ? (
                      <Badge variant="success">Baseline</Badge>
                    ) : (
                      <Badge variant="outline">Scenario</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {datetimeFmt.format(s.updatedAt)}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.createdBy?.email ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
