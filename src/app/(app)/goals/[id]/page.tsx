import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getGoalWithProgress } from "@/server/goals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { DeleteGoalButton, RefreshGoalButton } from "./refresh-button";

export const metadata = { title: "Goal · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const goal = await getGoalWithProgress(id);
  if (!goal) notFound();

  const targetMinor = Number(goal.targetAmountMinor);
  const plannedContribMinor = Number(goal.monthlyContributionMinor);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{goal.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{goal.kind}</Badge>
            <Badge variant="outline">{goal.currency}</Badge>
            <Badge variant={goal.progress.onTrack ? "success" : "warning"}>
              {goal.progress.onTrack ? "On track" : "Behind"}
            </Badge>
            {goal.isArchived ? <Badge variant="destructive">Archived</Badge> : null}
            <span className="text-muted-foreground">
              target {dateFmt.format(goal.targetDate)} · priority {goal.priority}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/goals/${goal.id}/edit` as Route}>Edit</Link>
            </Button>
            <RefreshGoalButton id={goal.id} hasLinkedAccount={!!goal.linkedAccountId} />
            <DeleteGoalButton id={goal.id} name={goal.name} />
          </div>
        </div>
      </div>

      {goal.hasFxWarning && goal.fxWarningReason ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {goal.fxWarningReason}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Current" value={formatMoney(goal.derivedCurrentMinor, goal.currency)} />
        <Stat label="Target" value={formatMoney(targetMinor, goal.currency)} />
        <Stat label="Remaining" value={formatMoney(goal.progress.remainingMinor, goal.currency)} />
        <Stat
          label="Progress"
          value={`${(goal.progress.pctComplete * 100).toFixed(1)}%`}
          emphasis
        />
      </div>

      <Card>
        <CardContent className="pt-5">
          <ProgressBar pct={goal.progress.pctComplete} />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatMoney(goal.derivedCurrentMinor, goal.currency)} contributed</span>
            <span>
              {formatMoney(Math.max(0, targetMinor - goal.derivedCurrentMinor), goal.currency)} to
              go
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Months remaining" value={`${goal.progress.monthsRemaining}`} />
        <Stat
          label="Required / month"
          value={formatMoney(goal.progress.requiredMonthlyMinor, goal.currency)}
          emphasis
        />
        <Stat
          label="Planned / month"
          value={formatMoney(plannedContribMinor, goal.currency)}
          positive={plannedContribMinor >= goal.progress.requiredMonthlyMinor}
        />
      </div>

      {goal.progress.projectedShortfallMinor > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Projected shortfall</CardTitle>
            <CardDescription>
              At your planned monthly contribution you&rsquo;ll be{" "}
              <strong>{formatMoney(goal.progress.projectedShortfallMinor, goal.currency)}</strong>{" "}
              short by {dateFmt.format(goal.targetDate)}. Increase the planned contribution to at
              least {formatMoney(goal.progress.requiredMonthlyMinor, goal.currency)} per month to
              stay on track.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {goal.linkedAccountId && goal.linkedAccount ? (
        <Card>
          <CardHeader>
            <CardTitle>Linked account</CardTitle>
            <CardDescription>
              Progress is derived from the latest balance on this account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/accounts/${goal.linkedAccount.id}` as Route}
              className="text-sm underline-offset-4 hover:underline"
            >
              {goal.linkedAccount.alias} · {goal.linkedAccount.currency}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No linked account</CardTitle>
            <CardDescription>
              Edit the goal to link an account if you want progress to update automatically.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const width = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${width}%` }} />
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
