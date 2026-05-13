import Link from "next/link";
import type { Route } from "next";
import { listGoalsWithProgress } from "@/server/goals";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Goals · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function GoalsPage() {
  await requireSession();
  const goals = await listGoalsWithProgress({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Goals</h1>
          <p className="mt-1 text-muted-foreground">
            Savings, debt payoff, and emergency-fund targets. Progress is derived from each
            goal&rsquo;s linked account when one is set.
          </p>
        </div>
        <Button asChild>
          <Link href={"/goals/new" as Route}>New goal</Link>
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-muted-foreground">No goals yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <Link key={g.id} href={`/goals/${g.id}` as Route} className="block">
              <Card className="space-y-3 p-5 transition-colors hover:bg-accent">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-medium">{g.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary">{g.kind}</Badge>
                      <Badge variant="outline">{g.currency}</Badge>
                      <Badge variant={g.progress.onTrack ? "success" : "warning"}>
                        {g.progress.onTrack ? "On track" : "Behind"}
                      </Badge>
                      {g.hasFxWarning ? <Badge variant="warning">FX risk</Badge> : null}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    by {dateFmt.format(g.targetDate)}
                  </div>
                </div>
                <ProgressBar pct={g.progress.pctComplete} />
                <div className="flex items-baseline justify-between text-sm tabular-nums">
                  <div>
                    <div className="text-lg font-semibold">
                      {formatMoney(g.derivedCurrentMinor, g.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      of {formatMoney(g.targetAmountMinor, g.currency)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {(g.progress.pctComplete * 100).toFixed(0)}% · {g.progress.monthsRemaining}mo
                    left
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const width = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}
