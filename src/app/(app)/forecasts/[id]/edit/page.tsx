import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getScenario } from "@/server/scenarios";
import { Card, CardContent } from "@/components/ui/card";
import { assumptionsSchema } from "@/schemas/scenario";
import { ScenarioForm } from "../../scenario-form";

export const metadata = { title: "Edit scenario · Household Finance" };

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const scenario = await getScenario(id);
  if (!scenario) notFound();
  const parsed = assumptionsSchema.safeParse(scenario.assumptions);
  if (!parsed.success) notFound();
  const a = parsed.data;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Edit scenario</h1>
      <Card>
        <CardContent className="pt-6">
          <ScenarioForm
            mode="edit"
            id={scenario.id}
            defaults={{
              name: scenario.name,
              isBaseline: scenario.isBaseline,
              startMonth: a.startMonth,
              horizonMonths: a.horizonMonths,
              monthlyIncomeAdjustment: a.monthlyIncomeAdjustment ?? "0",
              monthlyExpenseAdjustment: a.monthlyExpenseAdjustment ?? "0",
              annualIncomeGrowthPct: a.annualIncomeGrowthPct ?? "0",
              annualExpenseGrowthPct: a.annualExpenseGrowthPct ?? "0",
              annualReturnPct: a.annualReturnPct ?? "0",
              lumpSums: a.lumpSums.map((l) => ({
                month: l.month,
                amount: l.amount,
                description: l.description ?? "",
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
