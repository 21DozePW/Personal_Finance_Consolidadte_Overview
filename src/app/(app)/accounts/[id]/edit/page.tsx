import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth-guards";
import { getAccount } from "@/server/accounts";
import { listInstitutions } from "@/server/institutions";
import { AccountForm } from "../../account-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Edit account · Household Finance" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [account, institutions] = await Promise.all([getAccount(id), listInstitutions()]);
  if (!account) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Edit account</h1>
      <Card>
        <CardContent className="pt-6">
          <AccountForm
            mode="edit"
            institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
            account={{
              id: account.id,
              institutionId: account.institutionId,
              alias: account.alias,
              accountKind: account.accountKind,
              currency: account.currency,
              lastFour: account.lastFour,
              notes: account.notes,
              openedAt: account.openedAt,
              displayOrder: account.displayOrder,
              isActive: account.isActive,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
