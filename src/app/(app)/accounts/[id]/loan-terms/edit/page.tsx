import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth-guards";
import { getAccount } from "@/server/accounts";
import { getLoanTermsByAccount } from "@/server/loan-terms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fromMinor } from "@/lib/money";
import { bpsToPctString } from "@/schemas/loan-terms";
import { LoanTermsForm } from "../loan-terms-form";

export const metadata = { title: "Edit loan terms · Household Finance" };

const LIABILITY_LOAN = new Set(["LOAN", "LEASE", "MORTGAGE"]);

export default async function EditLoanTermsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();
  if (!LIABILITY_LOAN.has(account.accountKind)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not a loan account</CardTitle>
          <CardDescription>
            Loan terms can only be attached to LOAN, LEASE, or MORTGAGE accounts. Change the
            account&rsquo;s kind first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const existing = await getLoanTermsByAccount(id);
  const mode: "create" | "edit" = existing ? "edit" : "create";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {mode === "edit" ? "Edit loan terms" : "Add loan terms"}
      </h1>
      <Card>
        <CardContent className="pt-6">
          {mode === "create" ? (
            <LoanTermsForm mode="create" accountId={id} currency={account.currency} />
          ) : (
            <LoanTermsForm
              mode="edit"
              accountId={id}
              currency={account.currency}
              defaults={{
                principal: fromMinor(Number(existing!.principalMinor), account.currency).toString(),
                interestRatePct: bpsToPctString(existing!.interestRatePctBps),
                termMonths: existing!.termMonths,
                startDate: existing!.startDate.toISOString().slice(0, 10),
                paymentDayOfMonth: existing!.paymentDayOfMonth,
                monthlyPaymentOverride: fromMinor(
                  Number(existing!.monthlyPaymentMinor),
                  account.currency,
                ).toString(),
                remainingBalance: fromMinor(
                  Number(existing!.remainingBalanceMinor),
                  account.currency,
                ).toString(),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
