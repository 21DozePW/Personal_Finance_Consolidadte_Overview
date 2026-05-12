import { AccountKind } from "@prisma/client";

const LIABILITY_KINDS = new Set<AccountKind>([
  AccountKind.CREDIT_CARD,
  AccountKind.LOAN,
  AccountKind.LEASE,
  AccountKind.MORTGAGE,
  AccountKind.OTHER_LIABILITY,
]);

export function isAssetKind(kind: AccountKind): boolean {
  return !LIABILITY_KINDS.has(kind);
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  INVESTMENT: "Investment",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  LEASE: "Lease",
  MORTGAGE: "Mortgage",
  CASH: "Cash",
  OTHER_ASSET: "Other asset",
  OTHER_LIABILITY: "Other liability",
};

export const ACCOUNT_KIND_OPTIONS = (Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => ({
  value: k,
  label: ACCOUNT_KIND_LABEL[k],
  isAsset: isAssetKind(k),
}));
