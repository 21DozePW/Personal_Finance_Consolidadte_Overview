import Link from "next/link";
import type { Route } from "next";
import { requireAdmin } from "@/server/auth-guards";
import { listInstitutions } from "@/server/institutions";
import { AccountForm } from "../account-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "New account · Household Finance" };

export default async function NewAccountPage() {
  await requireAdmin();
  const institutions = await listInstitutions();

  if (institutions.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">New account</h1>
        <Card>
          <CardHeader>
            <CardTitle>Add an institution first</CardTitle>
            <CardDescription>
              Every account belongs to an institution. Create one before adding accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={"/admin/institutions" as Route}
              className="text-sm underline-offset-4 hover:underline"
            >
              Go to Institutions →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">New account</h1>
      <Card>
        <CardContent className="pt-6">
          <AccountForm
            mode="create"
            institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
