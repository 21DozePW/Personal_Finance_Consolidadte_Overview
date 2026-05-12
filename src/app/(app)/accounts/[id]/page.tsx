import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { getAccount } from "@/server/accounts";
import { listBalances } from "@/server/balances";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_KIND_LABEL } from "@/lib/account-kinds";
import { formatMoney } from "@/lib/money";
import { UpdateBalanceForm } from "./update-balance-form";
import { AccountAdminActions } from "./account-admin-actions";

export const metadata = { title: "Account · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const balances = await listBalances(id, { limit: 24 });
  const latest = balances[0];
  const todayIso = new Date().toISOString().slice(0, 10);
  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{account.institution.name}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{account.alias}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Badge variant={account.isAsset ? "success" : "warning"}>
              {account.isAsset ? "Asset" : "Liability"}
            </Badge>
            <Badge variant="outline">{ACCOUNT_KIND_LABEL[account.accountKind]}</Badge>
            <Badge variant="secondary">{account.currency}</Badge>
            {!account.isActive ? <Badge variant="destructive">Closed</Badge> : null}
          </div>
        </div>
        {isAdmin ? (
          <div className="flex items-start gap-2">
            <Button asChild variant="outline">
              <Link href={`/accounts/${account.id}/edit` as Route}>Edit</Link>
            </Button>
            <AccountAdminActions
              id={account.id}
              alias={account.alias}
              isActive={account.isActive}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {latest ? formatMoney(latest.balanceMinor, account.currency) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {latest ? (
              <>
                <div>as of {dateFmt.format(latest.asOfDate)}</div>
                <div>source: {latest.source.toLowerCase()}</div>
              </>
            ) : (
              <div>No balances yet — record one below.</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record a balance</CardTitle>
            <CardDescription>
              Stored in the account&rsquo;s native currency ({account.currency}). One row per date —
              re-recording the same day overwrites.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UpdateBalanceForm
              accountId={account.id}
              currency={account.currency}
              todayIso={todayIso}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balance history</CardTitle>
          <CardDescription>Last {balances.length} entries.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {balances.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No balance history yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Date</th>
                  <th className="px-5 py-2 text-right font-medium">Balance</th>
                  <th className="px-5 py-2 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id} className="border-b last:border-b-0">
                    <td className="px-5 py-2">{dateFmt.format(b.asOfDate)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">
                      {formatMoney(b.balanceMinor, account.currency)}
                    </td>
                    <td className="px-5 py-2 text-xs uppercase text-muted-foreground">
                      {b.source.toLowerCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {(account.lastFour || account.notes) && (
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Decrypted only for signed-in household members.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {account.lastFour ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Last four</div>
                <div className="font-mono">•••• {account.lastFour}</div>
              </div>
            ) : null}
            {account.notes ? (
              <div>
                <div className="text-xs uppercase text-muted-foreground">Notes</div>
                <p className="whitespace-pre-wrap">{account.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
