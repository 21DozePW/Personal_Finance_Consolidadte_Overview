"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_KIND_OPTIONS } from "@/lib/account-kinds";
import type { AccountKind } from "@prisma/client";
import { createAccountAction, updateAccountAction } from "./actions";

type Institution = { id: string; name: string };

type Account = {
  id: string;
  institutionId: string;
  alias: string;
  accountKind: AccountKind;
  currency: string;
  lastFour: string | null;
  notes: string | null;
  openedAt: Date | null;
  displayOrder: number;
  isActive: boolean;
};

type Props =
  | { mode: "create"; institutions: Institution[] }
  | { mode: "edit"; institutions: Institution[]; account: Account };

export function AccountForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      if (props.mode === "create") {
        const result = await createAccountAction(form);
        if (result.ok) router.push(`/accounts/${result.data.id}`);
        else setError(result.error);
      } else {
        const result = await updateAccountAction(props.account.id, form);
        if (result.ok) router.push(`/accounts/${props.account.id}`);
        else setError(result.error);
      }
    });
  }

  const acc = props.mode === "edit" ? props.account : null;

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institution" htmlFor="institutionId">
          <Select
            id="institutionId"
            name="institutionId"
            required
            defaultValue={acc?.institutionId ?? props.institutions[0]?.id ?? ""}
            disabled={pending}
          >
            <option value="" disabled>
              Select…
            </option>
            {props.institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alias" htmlFor="alias">
          <Input
            id="alias"
            name="alias"
            required
            placeholder="e.g. Joint Checking"
            defaultValue={acc?.alias ?? ""}
            disabled={pending}
          />
        </Field>
        <Field label="Kind" htmlFor="accountKind">
          <Select
            id="accountKind"
            name="accountKind"
            required
            defaultValue={acc?.accountKind ?? "CHECKING"}
            disabled={pending}
          >
            {ACCOUNT_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} {opt.isAsset ? "(asset)" : "(liability)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input
            id="currency"
            name="currency"
            required
            maxLength={3}
            placeholder="CHF"
            defaultValue={acc?.currency ?? "CHF"}
            disabled={pending}
          />
        </Field>
        <Field label="Last 4 (optional, encrypted)" htmlFor="lastFour">
          <Input
            id="lastFour"
            name="lastFour"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            placeholder="1234"
            defaultValue={acc?.lastFour ?? ""}
            disabled={pending}
          />
        </Field>
        <Field label="Display order" htmlFor="displayOrder">
          <Input
            id="displayOrder"
            name="displayOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={acc?.displayOrder ?? 0}
            disabled={pending}
          />
        </Field>
        <Field label="Opened on (optional)" htmlFor="openedAt">
          <Input
            id="openedAt"
            name="openedAt"
            type="date"
            defaultValue={acc?.openedAt ? acc.openedAt.toISOString().slice(0, 10) : ""}
            disabled={pending}
          />
        </Field>
        {props.mode === "edit" ? (
          <Field label="Status" htmlFor="isActive">
            <Select
              id="isActive"
              name="isActive"
              defaultValue={acc?.isActive ? "true" : "false"}
              disabled={pending}
            >
              <option value="true">Active</option>
              <option value="false">Closed / inactive</option>
            </Select>
          </Field>
        ) : null}
      </div>

      <Field label="Notes (optional, encrypted)" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={acc?.notes ?? ""}
          disabled={pending}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create account" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
