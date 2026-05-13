import Link from "next/link";
import type { Route } from "next";
import { listAuditLog, listDistinctEntityTypes } from "@/server/audit-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const metadata = { title: "Audit log · Admin · Household Finance" };

const datetimeFmt = new Intl.DateTimeFormat("en-CH", {
  dateStyle: "medium",
  timeStyle: "short",
});

type SearchParams = {
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [entityTypes, result] = await Promise.all([
    listDistinctEntityTypes(),
    listAuditLog({
      entityType: sp.entityType || undefined,
      action: sp.action || undefined,
      fromIso: sp.from ? `${sp.from}T00:00:00Z` : undefined,
      toIso: sp.to ? `${sp.to}T23:59:59Z` : undefined,
      cursor: sp.cursor,
      limit: 100,
    }),
  ]);

  const queryString = (extra: Partial<SearchParams>) => {
    const merged = { ...sp, ...extra };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-muted-foreground">
          Every structural change (account / category / FX override / scenario / import / budget /
          goal / etc.) writes an immutable row here with actor, action, and the before / after
          metadata. Encrypted fields are never recorded in plain.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form method="get" className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="entityType">Entity</Label>
              <Select id="entityType" name="entityType" defaultValue={sp.entityType ?? ""}>
                <option value="">All</option>
                {entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="action">Action contains</Label>
              <Input
                id="action"
                name="action"
                placeholder="UPDATED"
                defaultValue={sp.action ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={"/admin/audit" as Route}>Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No audit rows match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 text-left font-medium">When</th>
                <th className="px-5 py-3 text-left font-medium">Actor</th>
                <th className="px-5 py-3 text-left font-medium">Action</th>
                <th className="px-5 py-3 text-left font-medium">Entity</th>
                <th className="px-5 py-3 text-left font-medium">Before → after</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-b-0">
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {datetimeFmt.format(row.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {row.actor ? (
                      <>
                        {row.actor.displayName}
                        <div className="text-muted-foreground">{row.actor.email}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{row.action}</td>
                  <td className="px-5 py-3 text-xs">
                    <Badge variant="outline">{row.entityType}</Badge>
                    {row.entityId ? (
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {row.entityId}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">view</summary>
                      <pre className="mt-2 max-w-[40rem] overflow-x-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(
                          { before: row.before ?? null, after: row.after ?? null },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result.nextCursor ? (
          <div className="border-t p-3 text-right">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/audit${queryString({ cursor: result.nextCursor })}` as Route}>
                Next page →
              </Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
