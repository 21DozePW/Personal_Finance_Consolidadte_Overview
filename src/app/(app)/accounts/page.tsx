import Link from "next/link";
import type { Route } from "next";
import { listAccounts } from "@/server/accounts";
import { getLatestRateLookup } from "@/server/fx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_KIND_LABEL } from "@/lib/account-kinds";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";
import { requireSession } from "@/server/auth-guards";

export const metadata = { title: "Accounts · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

type AccountRow = Awaited<ReturnType<typeof listAccounts>>[number];
type DecoratedRow = AccountRow & { chfMinor: number | null };

export default async function AccountsPage() {
  const session = await requireSession();
  const accounts = await listAccounts({ includeInactive: false });

  const currencies = Array.from(new Set(accounts.map((a) => a.currency)));
  const lookup = await getLatestRateLookup(currencies);

  const decorated: DecoratedRow[] = accounts.map((a) => {
    const chfMinor = a.latestBalance
      ? convertToBaseMinor(a.latestBalance.balanceMinor, a.currency, lookup(a.currency))
      : null;
    return { ...a, chfMinor };
  });

  const assets = decorated.filter((a) => a.isAsset);
  const liabilities = decorated.filter((a) => !a.isAsset);
  const assetsTotalChf = sumChf(assets);
  const liabilitiesTotalChf = sumChf(liabilities);
  const netWorthChf =
    assetsTotalChf == null || liabilitiesTotalChf == null
      ? null
      : assetsTotalChf - liabilitiesTotalChf;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            All accounts grouped by assets and liabilities. Balances are shown in each
            account&rsquo;s native currency with the {BASE_CURRENCY} equivalent below using the most
            recent FX rate.
          </p>
        </div>
        {session.user.role === "ADMIN" ? (
          <Button asChild>
            <Link href={"/accounts/new" as Route}>New account</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Assets total"
          chfMinor={assetsTotalChf}
          subtitle={`${assets.length} ${assets.length === 1 ? "account" : "accounts"}`}
        />
        <SummaryCard
          title="Liabilities total"
          chfMinor={liabilitiesTotalChf}
          subtitle={`${liabilities.length} ${liabilities.length === 1 ? "account" : "accounts"}`}
        />
        <SummaryCard
          title="Net worth"
          chfMinor={netWorthChf}
          subtitle={`in ${BASE_CURRENCY}, latest rates`}
          emphasis
        />
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

function sumChf(rows: DecoratedRow[]): number | null {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const r of rows) {
    if (!r.latestBalance) continue; // no balance contributes 0
    if (r.chfMinor == null) return null; // any unconverted row poisons the total
    total += r.chfMinor;
  }
  return total;
}

function SummaryCard({
  title,
  chfMinor,
  subtitle,
  emphasis,
}: {
  title: string;
  chfMinor: number | null;
  subtitle: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className={emphasis ? "text-2xl tabular-nums" : "text-xl tabular-nums"}>
          {chfMinor == null ? "—" : formatMoney(chfMinor, BASE_CURRENCY)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{subtitle}</CardContent>
    </Card>
  );
}

function Section({
  title,
  accounts,
  emptyHint,
}: {
  title: string;
  accounts: DecoratedRow[];
  emptyHint: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const showsChf = a.currency !== BASE_CURRENCY;
            return (
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
                      {a.latestBalance
                        ? formatMoney(a.latestBalance.balanceMinor, a.currency)
                        : "—"}
                    </div>
                    {showsChf ? (
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {a.chfMinor == null
                          ? "no rate"
                          : `≈ ${formatMoney(a.chfMinor, BASE_CURRENCY)}`}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {a.latestBalance
                        ? `as of ${dateFmt.format(a.latestBalance.asOfDate)}`
                        : "No balances recorded"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
