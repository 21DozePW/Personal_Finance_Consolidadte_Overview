import { listAllowedEmails } from "@/server/allowed-emails";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";

export const metadata = { title: "Allowed emails · Admin · Household Finance" };

const dateFmt = new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" });

export default async function AllowedEmailsPage() {
  const entries = await listAllowedEmails();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Allowed emails</h1>
        <p className="mt-1 text-muted-foreground">
          Only Google accounts on this list can sign in. Revoking an entry also deactivates the
          linked user if they have already signed in.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-medium">Invite</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The first sign-in with this email consumes the invitation and creates a user with the
          chosen role.
        </p>
        <div className="mt-4">
          <InviteForm />
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Email</th>
              <th className="px-5 py-3 text-left font-medium">Role</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Invited</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No allow-list entries yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3 font-mono text-xs">{entry.email}</td>
                  <td className="px-5 py-3">
                    <Badge variant={entry.intendedRole === "ADMIN" ? "default" : "secondary"}>
                      {entry.intendedRole}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {entry.consumedBy ? (
                      <Badge variant={entry.consumedBy.isActive ? "success" : "warning"}>
                        {entry.consumedBy.isActive ? "Active" : "Inactive"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {dateFmt.format(entry.createdAt)}
                    {entry.invitedBy ? ` · by ${entry.invitedBy.email}` : null}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <RevokeButton id={entry.id} email={entry.email} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
