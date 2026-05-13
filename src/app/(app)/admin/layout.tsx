import Link from "next/link";
import type { Route } from "next";
import { requireAdmin } from "@/server/auth-guards";

const TABS: Array<{ href: Route; label: string }> = [
  { href: "/admin/users", label: "Allowed emails" },
  { href: "/admin/institutions", label: "Institutions" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/fx", label: "FX rates" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/backup", label: "Backup" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-t-md px-4 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
