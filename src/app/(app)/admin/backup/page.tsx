import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupForm } from "./backup-form";

export const metadata = { title: "Backup · Admin · Household Finance" };

export default function BackupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Backup</h1>
        <p className="mt-1 text-muted-foreground">
          Download a single encrypted JSON snapshot of the entire database. Two layers of protection
          apply: the passphrase you set here (PBKDF2-SHA256 → AES-256-GCM) and the server&rsquo;s
          field-encryption key, which protects encrypted columns inside the payload.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>
            To restore from a backup you need <strong>both</strong> the passphrase you choose here
            and <code>FIELD_ENCRYPTION_KEY</code> from your environment. Losing either makes the
            dump unreadable. Store the passphrase somewhere durable but separate from your
            production env vars.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&rsquo;s inside</CardTitle>
          <CardDescription>
            Every domain table, every audit row, every FX rate. Encrypted columns (account last-4,
            notes, transaction descriptions) stay encrypted under the field key — they travel as
            opaque ciphertext.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The file is named <code>household-finance-&lt;timestamp&gt;.json.enc</code>. Restore is a
          manual operation for v1: decrypt with the passphrase, then import the JSON into a fresh
          database.
        </CardContent>
      </Card>
    </div>
  );
}
