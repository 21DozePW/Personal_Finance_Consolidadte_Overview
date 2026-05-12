import Link from "next/link";
import type { Route } from "next";
import type { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = { href: Route; label: string; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/imports", label: "Imports" },
  { href: "/budgets", label: "Budgets" },
  { href: "/goals", label: "Goals" },
  { href: "/admin/users", label: "Admin", adminOnly: true },
];

export function Nav({ user }: { user: { name?: string | null; email: string; role: UserRole } }) {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || user.role === "ADMIN");

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href={"/dashboard" as Route} className="text-sm font-semibold tracking-tight">
            Household Finance
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium">{user.name ?? user.email}</div>
            <div className="text-muted-foreground">{user.email}</div>
          </div>
          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
