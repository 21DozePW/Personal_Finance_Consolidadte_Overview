import Link from "next/link";
import type { Route } from "next";
import { listAccounts } from "@/server/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_KIND_LABEL } from "@/lib/account-kinds";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/server/auth-guards";

export const metadata = { title: "Accounts · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function AccountsPage() {
  const session = await requireSession();
  const accounts = await listAccounts({ includeInactive: false });

  const assets = accounts.filter((a) => a.isAsset);
  const liabilities = accounts.filter((a) => !a.isAsset);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            All accounts grouped by assets and liabilities. Balances are shown in each
            account&rsquo;s native currency. CHF consolidation arrives in Phase&nbsp;2.5.
          </p>
        </div>
        {session.user.role === "ADMIN" ? (
          <Button asChild>
            <Link href={"/accounts/new" as Route}>New account</Link>
          </Button>
        ) : null}
      </div>

      <Section title="Assets" accounts={assets} emptyHint="No active asset accounts yet." />
      <Section
        title="Liabilities"
        accounts={liabilities}
        emptyHint="No active liability accounts yet."
      />
    </div>
  );
}

function Section({
  title,
  accounts,
  emptyHint,
}: {
  title: string;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  emptyHint: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}` as Route} className="block">
              <Card className="transition-colors hover:bg-accent">
                <CardHeader>
                  <CardDescription>{a.institution.name}</CardDescription>
                  <CardTitle className="text-base">{a.alias}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{ACCOUNT_KIND_LABEL[a.accountKind]}</Badge>
                    <Badge variant="secondary">{a.currency}</Badge>
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {a.latestBalance ? formatMoney(a.latestBalance.balanceMinor, a.currency) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.latestBalance
                      ? `as of ${dateFmt.format(a.latestBalance.asOfDate)}`
                      : "No balances recorded"}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
