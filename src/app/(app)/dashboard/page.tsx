import { requireSession } from "@/server/auth-guards";

export const metadata = { title: "Dashboard · Household Finance" };

export default async function DashboardPage() {
  const session = await requireSession();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {session.user.email} ({session.user.role.toLowerCase()}).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PlaceholderCard
          title="Net worth"
          body="Consolidated CHF view arrives in Phase 2.5 once FX is wired."
        />
        <PlaceholderCard
          title="Cash flow"
          body="Income, expenses, and budget variance land in Phases 3 and 7."
        />
        <PlaceholderCard
          title="Goals"
          body="Goal progress and forecast scenarios land in Phases 8 and 9."
        />
      </div>
    </div>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <div className="mt-3 text-sm">{body}</div>
    </div>
  );
}
