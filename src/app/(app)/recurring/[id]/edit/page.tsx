import { notFound } from "next/navigation";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { getRecurring } from "@/server/recurring";
import { requireSession } from "@/server/auth-guards";
import { Card, CardContent } from "@/components/ui/card";
import { fromMinor } from "@/lib/money";
import { RecurringForm } from "../../recurring-form";

export const metadata = { title: "Edit commitment · Household Finance" };

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [commitment, accounts, categories] = await Promise.all([
    getRecurring(id),
    listAccounts({ includeInactive: true }),
    listCategories({ includeArchived: true }),
  ]);
  if (!commitment) notFound();

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Edit recurring commitment</h1>
      <Card>
        <CardContent className="pt-6">
          <RecurringForm
            mode="edit"
            id={commitment.id}
            todayIso={todayIso}
            accounts={accounts.map((a) => ({
              id: a.id,
              alias: a.alias,
              currency: a.currency,
            }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            managedByLoanTerms={commitment.isManagedByLoanTerms}
            defaults={{
              name: commitment.name,
              accountId: commitment.accountId,
              categoryId: commitment.categoryId ?? "",
              amount: fromMinor(Number(commitment.amountMinor), commitment.currency).toString(),
              cadence: commitment.cadence,
              kind: commitment.kind,
              dayRule: commitment.dayRule ?? "",
              nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
              endDate: commitment.endDate ? commitment.endDate.toISOString().slice(0, 10) : "",
              notes: commitment.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
