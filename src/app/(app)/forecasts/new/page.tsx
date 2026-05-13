import { requireSession } from "@/server/auth-guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenarioForm } from "../scenario-form";

export const metadata = { title: "New scenario · Household Finance" };

export default async function NewScenarioPage() {
  await requireSession();
  const today = new Date();
  const startMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New scenario</h1>
      <Card>
        <CardHeader>
          <CardTitle>Assumptions</CardTitle>
          <CardDescription>
            Leave anything you don&rsquo;t want to change at 0. The projection always starts from
            your live net worth and runs recurring commitments forward, then layers these deltas on
            top.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioForm mode="create" defaultStartMonth={startMonth} />
        </CardContent>
      </Card>
    </div>
  );
}
