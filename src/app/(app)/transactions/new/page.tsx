import Link from "next/link";
import type { Route } from "next";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { requireSession } from "@/server/auth-guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionForm } from "../transaction-form";

export const metadata = { title: "New transaction · Household Finance" };

export default async function NewTransactionPage() {
  await requireSession();
  const [accounts, categories] = await Promise.all([
    listAccounts({ includeInactive: false }),
    listCategories({ includeArchived: false }),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">New transaction</h1>
        <Card>
          <CardHeader>
            <CardTitle>Add an account first</CardTitle>
            <CardDescription>
              Every transaction belongs to an account. Ask the admin to create one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={"/accounts" as Route} className="underline-offset-4 hover:underline">
              Go to Accounts →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New transaction</h1>
      <Card>
        <CardContent className="pt-6">
          <TransactionForm
            accounts={accounts.map((a) => ({ id: a.id, alias: a.alias, currency: a.currency }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            todayIso={todayIso}
          />
        </CardContent>
      </Card>
    </div>
  );
}
