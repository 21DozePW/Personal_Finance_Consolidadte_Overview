import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access denied · Household Finance" };

/**
 * Generic, non-enumerating "access denied" page. Auth.js redirects here for
 * every signIn failure — most often a rejected allow-list check. We
 * deliberately do not reveal whether a particular email was recognized.
 */
export default function SignInErrorPage() {
  return (
    <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This Google account is not authorized to use Household Finance. If you believe this is a
        mistake, ask the household admin to verify your invitation.
      </p>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/signin">Try a different account</Link>
        </Button>
      </div>
    </div>
  );
}
