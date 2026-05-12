import Link from "next/link";
import type { Route } from "next";
import { listImportBatches } from "@/server/imports";
import { requireSession } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Imports · Household Finance" };

const datetimeFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" });

export default async function ImportsPage() {
  await requireSession();
  const batches = await listImportBatches();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Imports</h1>
          <p className="mt-1 text-muted-foreground">
            CSV / OFX batches. Each upload creates a preview; commit it to add transactions or
            revert a committed batch to delete them again.
          </p>
        </div>
        <Button asChild>
          <Link href={"/imports/new" as Route}>New import</Link>
        </Button>
      </div>

      <Card>
        {batches.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">When</th>
                <th className="px-5 py-3 text-left font-medium">Account</th>
                <th className="px-5 py-3 text-left font-medium">File</th>
                <th className="px-5 py-3 text-right font-medium">Rows</th>
                <th className="px-5 py-3 text-right font-medium">Imported</th>
                <th className="px-5 py-3 text-right font-medium">Skipped</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {datetimeFmt.format(b.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/accounts/${b.account.id}` as Route}
                      className="underline-offset-4 hover:underline"
                    >
                      {b.account.alias}
                    </Link>
                    <div className="text-xs text-muted-foreground">{b.account.currency}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/imports/${b.id}` as Route}
                      className="font-mono text-xs underline-offset-4 hover:underline"
                    >
                      {b.fileName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{b.rowCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{b.importedCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{b.skippedCount}</td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={
                        b.status === "COMMITTED"
                          ? "success"
                          : b.status === "PENDING"
                            ? "warning"
                            : b.status === "REVERTED"
                              ? "outline"
                              : "destructive"
                      }
                    >
                      {b.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
