import Link from "next/link";
import type { Route } from "next";
import { listRecurring } from "@/server/recurring";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Recurring · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function RecurringPage() {
  await requireSession();
  const items = await listRecurring();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recurring commitments</h1>
          <p className="mt-1 text-muted-foreground">
            Income, subscriptions, and scheduled payments that flow into the cash-flow forecast.
            Loan-payment rows are managed by their account&rsquo;s loan terms — edits stick until
            the next loan-terms save.
          </p>
        </div>
        <Button asChild>
          <Link href={"/recurring/new" as Route}>New commitment</Link>
        </Button>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No recurring commitments yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-left font-medium">Account</th>
                <th className="px-5 py-3 text-left font-medium">Kind / cadence</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 text-left font-medium">Next due</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/recurring/${c.id}/edit` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.isManagedByLoanTerms ? (
                      <Badge variant="warning" className="ml-2">
                        loan-managed
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {c.account.alias}
                    <div className="text-muted-foreground">{c.account.currency}</div>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <Badge variant={c.kind === "INCOME" ? "success" : "secondary"}>{c.kind}</Badge>
                    <div className="mt-1 text-muted-foreground">{c.cadence.toLowerCase()}</div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMoney(c.amountMinor, c.currency)}
                  </td>
                  <td className="px-5 py-3 text-xs">{dateFmt.format(c.nextDueDate)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/recurring/${c.id}/edit` as Route}>Edit</Link>
                      </Button>
                      <DeleteRecurringWrap id={c.id} name={c.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// Tiny wrapper so the table stays in a server component while delete uses a
// client action.
import { DeleteRecurringButton } from "./delete-button";
function DeleteRecurringWrap({ id, name }: { id: string; name: string }) {
  return <DeleteRecurringButton id={id} name={name} />;
}
