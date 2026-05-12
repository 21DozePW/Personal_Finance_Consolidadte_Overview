import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/sign-in-button";

export const metadata = { title: "Sign in · Household Finance" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { callbackUrl } = await searchParams;

  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Access is restricted to invited household members. Sign in with the Google account
        registered with your invitation.
      </p>
      <div className="mt-8 flex justify-center">
        <SignInButton callbackUrl={callbackUrl ?? "/dashboard"} />
      </div>
    </div>
  );
}
