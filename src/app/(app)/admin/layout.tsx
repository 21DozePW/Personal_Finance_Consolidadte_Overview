import { requireAdmin } from "@/server/auth-guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="space-y-6">{children}</div>;
}
