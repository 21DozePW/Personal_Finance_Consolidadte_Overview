import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-guards";
import { getImportBatch } from "@/server/imports";
import { listCategories } from "@/server/categories";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { PendingActions, RevertButton } from "./commit-buttons";

export const metadata = { title: "Import · Household Finance" };

const datetimeFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" });
const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

type PreviewRow = {
  occurredOn: string;
  amount: string;
  amountMinor: string;
  description: string | null;
  merchant: string | null;
  externalId: string | null;
  dedupKey: string;
  isDuplicate: boolean;
  suggestedCategoryId: string | null;
};

type PreviewPayload = {
  format: "CSV" | "OFX";
  profileId: string | null;
  rows: PreviewRow[];
  warnings: string[];
};

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const batch = await getImportBatch(id);
  if (!batch) notFound();
  const categories = await listCategories({ includeArchived: true });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const preview = (batch.previewData ?? null) as PreviewPayload | null;
  const willImport = batch.rowCount - batch.skippedCount;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            {datetimeFmt.format(batch.createdAt)} ·{" "}
            <span className="font-mono">{batch.fileName}</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Import to {batch.account.alias}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{batch.account.currency}</Badge>
            <Badge
              variant={
                batch.status === "COMMITTED"
                  ? "success"
                  : batch.status === "PENDING"
                    ? "warning"
                    : batch.status === "REVERTED"
                      ? "outline"
                      : "destructive"
              }
            >
              {batch.status}
            </Badge>
            <span className="text-muted-foreground">{batch.rowCount} rows</span>
          </div>
        </div>
        {batch.status === "PENDING" ? <PendingActions id={batch.id} /> : null}
        {batch.status === "COMMITTED" ? <RevertButton id={batch.id} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Rows parsed" value={batch.rowCount} />
        <Stat
          label={batch.status === "PENDING" ? "Will import" : "Imported"}
          value={batch.status === "PENDING" ? willImport : batch.importedCount}
        />
        <Stat label="Duplicates skipped" value={batch.skippedCount} />
      </div>

      {preview?.warnings && preview.warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Warnings</CardTitle>
            <CardDescription>
              Rows the parser flagged. They are excluded from preview.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs text-amber-700">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {preview?.rows && preview.rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{batch.status === "PENDING" ? "Preview" : "Rows in this batch"}</CardTitle>
            <CardDescription>
              {batch.status === "PENDING"
                ? "Duplicates are detected by FITID/externalId when present, otherwise by a hash of date + amount + description."
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <table className="w-full text-xs">
              <thead className="border-y uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Date</th>
                  <th className="px-5 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 text-left font-medium">Description</th>
                  <th className="px-5 py-2 text-left font-medium">Suggested category</th>
                  <th className="px-5 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const minor = BigInt(r.amountMinor);
                  const cat = r.suggestedCategoryId ? categoryMap.get(r.suggestedCategoryId) : null;
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-5 py-2">
                        {dateFmt.format(new Date(`${r.occurredOn}T00:00:00Z`))}
                      </td>
                      <td
                        className={`px-5 py-2 text-right tabular-nums ${
                          minor < 0n ? "text-destructive" : "text-emerald-700"
                        }`}
                      >
                        {formatMoney(minor, batch.account.currency)}
                      </td>
                      <td className="max-w-[24rem] truncate px-5 py-2">{r.description ?? "—"}</td>
                      <td className="px-5 py-2">
                        {cat ? <Badge variant="secondary">{cat.name}</Badge> : "—"}
                      </td>
                      <td className="px-5 py-2">
                        {r.isDuplicate ? (
                          <Badge variant="warning">duplicate</Badge>
                        ) : (
                          <Badge variant="outline">new</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
