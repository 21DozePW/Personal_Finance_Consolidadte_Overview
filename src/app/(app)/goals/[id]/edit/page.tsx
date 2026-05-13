import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getGoal } from "@/server/goals";
import { listAccounts } from "@/server/accounts";
import { Card, CardContent } from "@/components/ui/card";
import { fromMinor } from "@/lib/money";
import { GoalForm } from "../../goal-form";

export const metadata = { title: "Edit goal · Household Finance" };

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [goal, accounts] = await Promise.all([
    getGoal(id),
    listAccounts({ includeInactive: true }),
  ]);
  if (!goal) notFound();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Edit goal</h1>
      <Card>
        <CardContent className="pt-6">
          <GoalForm
            mode="edit"
            id={goal.id}
            todayIso={todayIso}
            accounts={accounts.map((a) => ({ id: a.id, alias: a.alias, currency: a.currency }))}
            defaults={{
              name: goal.name,
              kind: goal.kind,
              currency: goal.currency,
              targetAmount: fromMinor(Number(goal.targetAmountMinor), goal.currency).toString(),
              targetDate: goal.targetDate.toISOString().slice(0, 10),
              linkedAccountId: goal.linkedAccountId ?? "",
              currentAmount: fromMinor(Number(goal.currentAmountMinor), goal.currency).toString(),
              monthlyContribution: fromMinor(
                Number(goal.monthlyContributionMinor),
                goal.currency,
              ).toString(),
              priority: goal.priority,
              isArchived: goal.isArchived,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
