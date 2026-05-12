import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getActiveCurrencies, getLatestRates, listFetchLog } from "@/server/fx";
import { RefreshFxButton } from "./refresh-button";
import { OverrideFxForm } from "./override-form";

export const metadata = { title: "FX rates · Admin · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });
const datetimeFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" });

export default async function FxPage() {
  const currencies = await getActiveCurrencies();
  const rates = await getLatestRates(currencies);
  const log = await listFetchLog(20);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">FX rates</h1>
        <p className="mt-1 text-muted-foreground">
          Daily CHF rates from exchangerate.host (primary) and Frankfurter (fallback). The cron runs
          at 05:00 UTC; you can also fetch manually or override individual rates here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current rates (1 CHF =)</CardTitle>
          <CardDescription>
            Tracked currencies: {currencies.length === 0 ? "none" : currencies.join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {currencies.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              No non-CHF currencies in use yet. Add a foreign-currency account to start tracking.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Currency</th>
                  <th className="px-5 py-2 text-right font-medium">Rate</th>
                  <th className="px-5 py-2 text-left font-medium">As of</th>
                  <th className="px-5 py-2 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => {
                  const r = rates.get(c);
                  return (
                    <tr key={c} className="border-b last:border-b-0">
                      <td className="px-5 py-2 font-mono">{c}</td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {r ? Number(r.rate).toFixed(6) : "—"}
                      </td>
                      <td className="px-5 py-2 text-xs text-muted-foreground">
                        {r ? dateFmt.format(r.asOfDate) : "no data"}
                      </td>
                      <td className="px-5 py-2 text-xs">
                        {r ? <Badge variant="outline">{r.source}</Badge> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refresh</CardTitle>
          <CardDescription>
            Triggers the same fetch the cron does. Runs primary, falls back to Frankfurter for any
            missing currency, and writes a log row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RefreshFxButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual override</CardTitle>
          <CardDescription>
            Use when the providers have a gap. The override wins for that exact date and is
            audit-logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverrideFxForm currencies={currencies} todayIso={todayIso} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent fetch log</CardTitle>
          <CardDescription>Last 20 cron / manual fetch runs.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {log.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No fetches recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-y text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">When</th>
                  <th className="px-5 py-2 text-left font-medium">Status</th>
                  <th className="px-5 py-2 text-left font-medium">Currencies fetched</th>
                  <th className="px-5 py-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b align-top last:border-b-0">
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {datetimeFmt.format(entry.runAt)}
                    </td>
                    <td className="px-5 py-2">
                      <Badge
                        variant={
                          entry.status === "OK"
                            ? "success"
                            : entry.status === "PARTIAL"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-2 font-mono text-xs">
                      {Array.isArray(entry.currenciesFetched)
                        ? (entry.currenciesFetched as string[]).join(", ") || "—"
                        : "—"}
                    </td>
                    <td className="px-5 py-2 text-xs text-muted-foreground">
                      {entry.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
