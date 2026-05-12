import Link from "next/link";
import type { Route } from "next";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { requireSession } from "@/server/auth-guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringForm } from "../recurring-form";

export const metadata = { title: "New commitment · Household Finance" };

export default async function NewRecurringPage() {
  await requireSession();
  const [accounts, categories] = await Promise.all([
    listAccounts({ includeInactive: false }),
    listCategories({ includeArchived: false }),
  ]);

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add an account first</CardTitle>
          <CardDescription>Every commitment belongs to an account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={"/accounts" as Route} className="underline-offset-4 hover:underline">
            Go to Accounts →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New recurring commitment</h1>
      <Card>
        <CardContent className="pt-6">
          <RecurringForm
            mode="create"
            todayIso={todayIso}
            accounts={accounts.map((a) => ({ id: a.id, alias: a.alias, currency: a.currency }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
