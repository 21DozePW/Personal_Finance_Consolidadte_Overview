import { requireAdmin } from "@/server/auth-guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewBudgetForm } from "./new-form";

export const metadata = { title: "New budget · Household Finance" };

export default async function NewBudgetPage() {
  await requireAdmin();
  const today = new Date();
  const startMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New budget</h1>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            v1 supports CHF-denominated budgets only. Lines are added on the budget&rsquo;s detail
            page after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewBudgetForm defaultStartMonth={startMonth} />
        </CardContent>
      </Card>
    </div>
  );
}
