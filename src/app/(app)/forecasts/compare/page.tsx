import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/server/auth-guards";
import { getScenarioProjection, listScenarios } from "@/server/scenarios";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY } from "@/lib/fx";
import { FORECAST_MILESTONES, type ForecastRow } from "@/lib/forecast";

export const metadata = { title: "Compare scenarios · Household Finance" };

type SearchParams = { a?: string; b?: string };

const monthFmt = new Intl.DateTimeFormat("en-CH", { month: "short", year: "numeric" });

export default async function CompareScenariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireSession();
  const sp = await searchParams;
  const scenarios = await listScenarios();
  const baseline = scenarios.find((s) => s.isBaseline);
  const aId = sp.a ?? baseline?.id ?? scenarios[0]?.id ?? null;
  const bId = sp.b ?? scenarios.find((s) => s.id !== aId)?.id ?? null;

  if (!aId || !bId || aId === bId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Compare scenarios</h1>
        <Card>
          <CardHeader>
            <CardTitle>Pick two scenarios</CardTitle>
            <CardDescription>
              Use the links below or pass <code>?a=…&amp;b=…</code> in the URL. The baseline is
              auto-selected as the left-hand side when available.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {scenarios.map((s) => (
              <Link
                key={s.id}
                href={`/forecasts/compare?a=${aId ?? s.id}&b=${s.id}` as Route}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {s.name}
                {s.isBaseline ? " (baseline)" : ""}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const [aProj, bProj] = await Promise.all([
    getScenarioProjection(aId),
    getScenarioProjection(bId),
  ]);

  const milestoneOptions = FORECAST_MILESTONES;
  const maxRows = Math.max(aProj.result.rows.length, bProj.result.rows.length);
  const rows: Array<{ a?: ForecastRow; b?: ForecastRow }> = [];
  for (let i = 0; i < maxRows; i++) {
    rows.push({ a: aProj.result.rows[i], b: bProj.result.rows[i] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Compare scenarios</h1>
        <p className="mt-1 text-muted-foreground">
          Side-by-side projection of two scenarios. Difference is computed at every milestone.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ScenarioCard label="A" projection={aProj} />
        <ScenarioCard label="B" projection={bProj} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Milestone difference (B − A)</CardTitle>
          <CardDescription>How much further ahead/behind B ends at each horizon.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {milestoneOptions.map((m) => {
            const a = aProj.result.rows[m - 1]?.endingNetWorthMinor ?? 0;
            const b = bProj.result.rows[m - 1]?.endingNetWorthMinor ?? 0;
            const delta = b - a;
            return (
              <div key={m} className="rounded-md border bg-card px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  {m / 12} year{m === 12 ? "" : "s"} ({m} mo)
                </div>
                <div
                  className={
                    "mt-1 text-lg font-semibold tabular-nums " +
                    (delta >= 0 ? "text-emerald-700" : "text-destructive")
                  }
                >
                  {delta >= 0 ? "+" : ""}
                  {formatMoney(delta, BASE_CURRENCY)}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly ending net worth</CardTitle>
          <CardDescription>
            Each row is the projected ending net worth for that month under each scenario.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-y bg-card uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Month</th>
                  <th className="px-5 py-2 text-right font-medium">A</th>
                  <th className="px-5 py-2 text-right font-medium">B</th>
                  <th className="px-5 py-2 text-right font-medium">B − A</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pair, i) => {
                  const month = pair.a?.month ?? pair.b?.month ?? "—";
                  const date = month !== "—" ? new Date(`${month}-01T00:00:00Z`) : null;
                  const aEnd = pair.a?.endingNetWorthMinor ?? null;
                  const bEnd = pair.b?.endingNetWorthMinor ?? null;
                  const delta = aEnd != null && bEnd != null ? bEnd - aEnd : null;
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-5 py-1.5">{date ? monthFmt.format(date) : month}</td>
                      <td className="px-5 py-1.5 text-right tabular-nums">
                        {aEnd == null ? "—" : formatMoney(aEnd, BASE_CURRENCY)}
                      </td>
                      <td className="px-5 py-1.5 text-right tabular-nums">
                        {bEnd == null ? "—" : formatMoney(bEnd, BASE_CURRENCY)}
                      </td>
                      <td
                        className={
                          "px-5 py-1.5 text-right tabular-nums " +
                          (delta == null
                            ? ""
                            : delta >= 0
                              ? "text-emerald-700"
                              : "text-destructive")
                        }
                      >
                        {delta == null
                          ? "—"
                          : (delta >= 0 ? "+" : "") + formatMoney(delta, BASE_CURRENCY)}
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

function ScenarioCard({
  label,
  projection,
}: {
  label: string;
  projection: Awaited<ReturnType<typeof getScenarioProjection>>;
}) {
  const { scenario, result, startingNetWorthChfMinor } = projection;
  const ending =
    result.rows[result.rows.length - 1]?.endingNetWorthMinor ?? startingNetWorthChfMinor;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            <span className="mr-2 text-xs text-muted-foreground">{label}</span>
            {scenario.name}
          </CardTitle>
          {scenario.isBaseline ? <Badge variant="success">Baseline</Badge> : null}
        </div>
        <CardDescription>
          {result.rows.length}-month horizon · starting{" "}
          {formatMoney(startingNetWorthChfMinor, BASE_CURRENCY)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {formatMoney(ending, BASE_CURRENCY)}
        </div>
        <div className="text-xs text-muted-foreground">ending net worth</div>
      </CardContent>
    </Card>
  );
}
