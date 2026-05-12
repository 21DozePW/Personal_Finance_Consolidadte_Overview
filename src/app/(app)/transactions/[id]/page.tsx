import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getTransaction } from "@/server/transactions";
import { listCategories } from "@/server/categories";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";
import { EditTransactionForm } from "./edit-form";

export const metadata = { title: "Transaction · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const [txn, categories] = await Promise.all([getTransaction(id), listCategories({})]);
  if (!txn) notFound();

  const rate = txn.fxRateToBase ? Number(txn.fxRateToBase) : null;
  const chf =
    txn.currency === BASE_CURRENCY
      ? Number(txn.amountMinor)
      : convertToBaseMinor(txn.amountMinor, txn.currency, rate);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link
              href={`/accounts/${txn.account.id}` as Route}
              className="underline-offset-4 hover:underline"
            >
              {txn.account.alias}
            </Link>{" "}
            · {dateFmt.format(txn.occurredOn)}
          </div>
          <h1
            className={
              "mt-1 text-3xl font-semibold tabular-nums tracking-tight " +
              (BigInt(txn.amountMinor) < 0n ? "text-destructive" : "text-emerald-700")
            }
          >
            {formatMoney(txn.amountMinor, txn.currency)}
          </h1>
          {txn.currency !== BASE_CURRENCY ? (
            <div className="text-sm tabular-nums text-muted-foreground">
              ≈ {chf == null ? "—" : formatMoney(chf, BASE_CURRENCY)}
              {rate ? ` · captured rate ${rate.toFixed(6)}` : ""}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {txn.category ? <Badge variant="secondary">{txn.category.name}</Badge> : null}
            {txn.isTransfer ? <Badge variant="outline">Transfer</Badge> : null}
            {txn.splitGroupId ? <Badge variant="outline">Split</Badge> : null}
            <Badge variant="outline">{txn.source.toLowerCase()}</Badge>
          </div>
        </div>
      </div>

      {txn.isTransfer && txn.transferPair ? (
        <Card>
          <CardHeader>
            <CardTitle>Transfer pair</CardTitle>
            <CardDescription>The other leg of this transfer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/transactions/${txn.transferPair.id}` as Route}
              className="text-sm underline-offset-4 hover:underline"
            >
              {txn.transferPair.account.alias} ·{" "}
              <span className="tabular-nums">
                {formatMoney(txn.transferPair.amountMinor, txn.transferPair.currency)}
              </span>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Edit</CardTitle>
          <CardDescription>
            {txn.isTransfer
              ? "Transfer amounts are immutable — delete and re-create to change them."
              : "Description, category, date, and amount can all change. The captured FX rate is refreshed when the date moves."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditTransactionForm
            txn={{
              id: txn.id,
              currency: txn.currency,
              occurredOn: txn.occurredOn.toISOString().slice(0, 10),
              postedOn: txn.postedOn ? txn.postedOn.toISOString().slice(0, 10) : null,
              amountMinor: txn.amountMinor.toString(),
              categoryId: txn.categoryId,
              description: txn.description,
              isTransfer: txn.isTransfer,
              splitGroupId: txn.splitGroupId,
            }}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
