import { listInstitutions } from "@/server/institutions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstitutionForm } from "./institution-form";
import { DeleteInstitutionButton } from "./delete-button";

export const metadata = { title: "Institutions · Admin · Household Finance" };

export default async function InstitutionsPage() {
  const institutions = await listInstitutions();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Institutions</h1>
        <p className="mt-1 text-muted-foreground">
          Banks, brokerages, and lenders that hold the household&rsquo;s accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add institution</CardTitle>
          <CardDescription>
            Use the user-facing brand name (e.g. &ldquo;UBS&rdquo;).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstitutionForm mode="create" />
        </CardContent>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Name</th>
              <th className="px-5 py-3 text-left font-medium">Type</th>
              <th className="px-5 py-3 text-left font-medium">Country</th>
              <th className="px-5 py-3 text-left font-medium">Website</th>
              <th className="px-5 py-3 text-right font-medium">Accounts</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {institutions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  No institutions yet.
                </td>
              </tr>
            ) : (
              institutions.map((inst) => (
                <tr key={inst.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3 font-medium">{inst.name}</td>
                  <td className="px-5 py-3">
                    <Badge variant="secondary">{inst.type}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{inst.country ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {inst.website ? (
                      <a
                        className="underline-offset-4 hover:underline"
                        href={inst.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {new URL(inst.website).host}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{inst._count.accounts}</td>
                  <td className="px-5 py-3 text-right">
                    <DeleteInstitutionButton id={inst.id} name={inst.name} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
