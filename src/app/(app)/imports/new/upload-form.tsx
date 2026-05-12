"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { startImportAction } from "../actions";

type AccountOption = { id: string; alias: string; currency: string; institutionId: string };
type ProfileOption = {
  id: string;
  name: string;
  institutionId: string;
  dateFormat: string;
  decimalSeparator: "." | ",";
};

export function UploadForm({
  accounts,
  profiles,
}: {
  accounts: AccountOption[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"CSV" | "OFX">("CSV");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [profileId, setProfileId] = useState("");
  const [useProfile, setUseProfile] = useState(true);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const availableProfiles = selectedAccount
    ? profiles.filter((p) => p.institutionId === selectedAccount.institutionId)
    : [];

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await startImportAction(form);
      if (result.ok) router.push(`/imports/${result.data.id}`);
      else setError(result.error);
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select
            id="accountId"
            name="accountId"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias} ({a.currency})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="format">Format</Label>
          <Select
            id="format"
            name="format"
            required
            value={format}
            onChange={(e) => setFormat(e.target.value as "CSV" | "OFX")}
          >
            <option value="CSV">CSV</option>
            <option value="OFX">OFX / QFX</option>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="file">File (≤ 5 MB)</Label>
          <Input
            id="file"
            name="file"
            type="file"
            required
            accept={format === "CSV" ? ".csv,text/csv" : ".ofx,.qfx,application/x-ofx"}
            disabled={pending}
          />
        </div>
      </div>

      {format === "CSV" ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="text-sm font-medium">CSV options</div>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="csvSource"
                checked={useProfile}
                onChange={() => setUseProfile(true)}
              />
              Use a saved profile
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="csvSource"
                checked={!useProfile}
                onChange={() => setUseProfile(false)}
              />
              Configure inline
            </label>
          </div>

          {useProfile ? (
            <div className="space-y-1.5">
              <Label htmlFor="profileId">Import profile</Label>
              <Select
                id="profileId"
                name="profileId"
                required
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                <option value="" disabled>
                  {availableProfiles.length === 0
                    ? "No profiles for this institution"
                    : "Pick a profile…"}
                </option>
                {availableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.dateFormat}, “{p.decimalSeparator}”)
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <InlineCsvOptions />
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload & preview"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

function InlineCsvOptions() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dateFormat">Date format</Label>
          <Select id="dateFormat" name="dateFormat" required defaultValue="DD.MM.YYYY">
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY</option>
            <option value="MM-DD-YYYY">MM-DD-YYYY</option>
            <option value="DD.MM.YY">DD.MM.YY</option>
            <option value="DD/MM/YY">DD/MM/YY</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="decimalSeparator">Decimal separator</Label>
          <Select id="decimalSeparator" name="decimalSeparator" required defaultValue=".">
            <option value=".">.</option>
            <option value=",">,</option>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="columnMap">columnMap JSON</Label>
        <textarea
          id="columnMap"
          name="columnMap"
          rows={5}
          placeholder='{"date":{"source":"Date"},"description":{"source":"Description"},"amount":{"source":"Amount"}}'
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          required
        />
        <p className="text-xs text-muted-foreground">
          Map your file&rsquo;s column headers to the semantic fields. Either map a single
          signed-amount column, or both `debit` and `credit`.
        </p>
      </div>
    </div>
  );
}
