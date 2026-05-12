import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getAccount } from "@/server/accounts";
import { getLoanTermsByAccount, scheduleForLoan } from "@/server/loan-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { bpsToPctString } from "@/schemas/loan-terms";
import { PayoffCalculator } from "./payoff-calculator";
import { DeleteLoanTermsButton } from "./delete-button";

export const metadata = { title: "Loan terms · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function LoanTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const terms = await getLoanTermsByAccount(id);
  const isAdmin = session.user.role === "ADMIN";

  if (!terms) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-sm text-muted-foreground">{account.institution.name}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{account.alias}</h1>
          <Badge variant="warning" className="mt-2">
            Liability · {account.accountKind}
          </Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No loan terms yet</CardTitle>
            <CardDescription>
              Add the principal, interest rate, and term to see the amortization schedule and
              auto-create a monthly payment commitment for cash-flow forecasting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <Button asChild>
                <Link href={`/accounts/${id}/loan-terms/edit` as Route}>Add loan terms</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Ask an Admin to add the terms.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const principalMinor = Number(terms.principalMinor);
  const remainingMinor = Number(terms.remainingBalanceMinor);
  const monthlyMinor = Number(terms.monthlyPaymentMinor);
  const schedule = scheduleForLoan(terms);
  const totalInterest = schedule.reduce((sum, r) => sum + r.interestMinor, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{account.institution.name}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{account.alias}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="warning">{account.accountKind}</Badge>
            <Badge variant="secondary">{account.currency}</Badge>
            <Badge variant="outline">{bpsToPctString(terms.interestRatePctBps)}% APR</Badge>
            <Badge variant="outline">{terms.termMonths} months</Badge>
          </div>
        </div>
        {isAdmin ? (
          <div className="flex items-start gap-2">
            <Button asChild variant="outline">
              <Link href={`/accounts/${id}/loan-terms/edit` as Route}>Edit</Link>
            </Button>
            <DeleteLoanTermsButton accountId={id} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Original principal" value={formatMoney(principalMinor, account.currency)} />
        <Stat label="Remaining balance" value={formatMoney(remainingMinor, account.currency)} />
        <Stat label="Monthly payment" value={formatMoney(monthlyMinor, account.currency)} />
        <Stat
          label="Projected payoff"
          value={terms.payoffDate ? dateFmt.format(terms.payoffDate) : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payoff calculator</CardTitle>
          <CardDescription>
            Simulate paying extra each month against the current remaining balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayoffCalculator
            currency={account.currency}
            remainingBalanceMinor={remainingMinor}
            interestRatePctBps={terms.interestRatePctBps}
            baselinePaymentMinor={monthlyMinor}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amortization schedule</CardTitle>
          <CardDescription>
            From start date · total interest over the original term:{" "}
            {formatMoney(totalInterest, account.currency)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-y bg-card uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">#</th>
                  <th className="px-5 py-2 text-left font-medium">Due</th>
                  <th className="px-5 py-2 text-right font-medium">Payment</th>
                  <th className="px-5 py-2 text-right font-medium">Interest</th>
                  <th className="px-5 py-2 text-right font-medium">Principal</th>
                  <th className="px-5 py-2 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.monthNumber} className="border-b last:border-b-0">
                    <td className="px-5 py-1.5">{row.monthNumber}</td>
                    <td className="px-5 py-1.5">{dateFmt.format(row.dueDate)}</td>
                    <td className="px-5 py-1.5 text-right tabular-nums">
                      {formatMoney(row.paymentMinor, account.currency)}
                    </td>
                    <td className="px-5 py-1.5 text-right tabular-nums text-amber-700">
                      {formatMoney(row.interestMinor, account.currency)}
                    </td>
                    <td className="px-5 py-1.5 text-right tabular-nums text-emerald-700">
                      {formatMoney(row.principalMinor, account.currency)}
                    </td>
                    <td className="px-5 py-1.5 text-right tabular-nums">
                      {formatMoney(row.remainingMinor, account.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
