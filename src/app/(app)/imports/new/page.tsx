import { listAccounts } from "@/server/accounts";
import { listImportProfiles } from "@/server/import-profiles";
import { requireSession } from "@/server/auth-guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadForm } from "./upload-form";

export const metadata = { title: "New import · Household Finance" };

export default async function NewImportPage() {
  await requireSession();
  const [accounts, profiles] = await Promise.all([
    listAccounts({ includeInactive: false }),
    listImportProfiles(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New import</h1>
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            CSV needs a column map and date / decimal settings — save these as a per-institution
            profile after the first time. OFX detects everything from the file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm
            accounts={accounts.map((a) => ({
              id: a.id,
              alias: a.alias,
              currency: a.currency,
              institutionId: a.institutionId,
            }))}
            profiles={profiles.map((p) => ({
              id: p.id,
              name: p.name,
              institutionId: p.institutionId,
              dateFormat: p.dateFormat,
              decimalSeparator: p.decimalSeparator as "." | ",",
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
