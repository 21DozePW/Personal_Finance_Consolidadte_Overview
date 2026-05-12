import Link from "next/link";
import type { Route } from "next";
import { listTransactions } from "@/server/transactions";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";

export const metadata = { title: "Transactions · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

type SearchParams = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  currency?: string;
  q?: string;
  isTransfer?: "true" | "false";
  cursor?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireSession();
  const sp = await searchParams;
  const [accounts, categories, result] = await Promise.all([
    listAccounts({ includeInactive: true }),
    listCategories({ includeArchived: true }),
    listTransactions({ ...sp, limit: 50 }),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const queryString = (extra: Partial<SearchParams>) => {
    const merged = { ...sp, ...extra };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Manual transactions, transfers, and splits — filterable by date, account, category,
            currency, or text. CHF equivalent uses the FX rate captured when the transaction was
            recorded.
          </p>
        </div>
        <Button asChild>
          <Link href={"/transactions/new" as Route}>New transaction</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form method="get" className="grid gap-3 sm:grid-cols-7">
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="f-from">From</Label>
              <Input id="f-from" name="from" type="date" defaultValue={sp.from ?? ""} />
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="f-to">To</Label>
              <Input id="f-to" name="to" type="date" defaultValue={sp.to ?? ""} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="f-account">Account</Label>
              <Select id="f-account" name="accountId" defaultValue={sp.accountId ?? ""}>
                <option value="">All</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.alias} · {a.currency}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="f-category">Category</Label>
              <Select id="f-category" name="categoryId" defaultValue={sp.categoryId ?? ""}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="f-q">Search</Label>
              <Input id="f-q" name="q" placeholder="merchant" defaultValue={sp.q ?? ""} />
            </div>
            <div className="flex items-end gap-2 sm:col-span-1">
              <Button type="submit">Apply</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={"/transactions" as Route}>Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No transactions match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Date</th>
                <th className="px-5 py-3 text-left font-medium">Account</th>
                <th className="px-5 py-3 text-left font-medium">Category</th>
                <th className="px-5 py-3 text-left font-medium">Description</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 text-right font-medium">≈ {BASE_CURRENCY}</th>
                <th className="px-5 py-3 text-left font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((t) => {
                const acc = accountMap.get(t.accountId);
                const rate = t.fxRateToBase ? Number(t.fxRateToBase) : null;
                const chf =
                  t.currency === BASE_CURRENCY
                    ? Number(t.amountMinor)
                    : convertToBaseMinor(t.amountMinor, t.currency, rate);
                return (
                  <tr key={t.id} className="border-b align-top last:border-b-0">
                    <td className="px-5 py-3 text-xs">{dateFmt.format(t.occurredOn)}</td>
                    <td className="px-5 py-3">
                      {acc ? (
                        <Link
                          href={`/accounts/${acc.id}` as Route}
                          className="underline-offset-4 hover:underline"
                        >
                          {acc.alias}
                        </Link>
                      ) : (
                        t.accountId
                      )}
                      <div className="text-xs text-muted-foreground">{t.currency}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">{t.category?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-xs">
                      <Link
                        href={`/transactions/${t.id}` as Route}
                        className="underline-offset-4 hover:underline"
                      >
                        {t.description ?? "(no description)"}
                      </Link>
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${
                        BigInt(t.amountMinor) < 0n ? "text-destructive" : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(t.amountMinor, t.currency)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {chf == null ? "—" : formatMoney(chf, BASE_CURRENCY)}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {t.isTransfer ? <Badge variant="outline">Transfer</Badge> : null}
                        {t.splitGroupId ? <Badge variant="outline">Split</Badge> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {result.nextCursor ? (
          <div className="border-t p-3 text-right">
            <Button asChild variant="outline" size="sm">
              <Link href={`/transactions${queryString({ cursor: result.nextCursor })}` as Route}>
                Next page →
              </Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
