import { requireSession } from "@/server/auth-guards";
import { listAccounts } from "@/server/accounts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalForm } from "../goal-form";

export const metadata = { title: "New goal · Household Finance" };

export default async function NewGoalPage() {
  await requireSession();
  const accounts = await listAccounts({ includeInactive: false });
  const today = new Date();
  const oneYear = new Date(
    Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), today.getUTCDate()),
  );
  const todayIso = oneYear.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New goal</h1>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Linking an account derives the current amount from its latest balance. Without a link
            the current amount is whatever you enter and stays put.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm
            mode="create"
            todayIso={todayIso}
            accounts={accounts.map((a) => ({ id: a.id, alias: a.alias, currency: a.currency }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
