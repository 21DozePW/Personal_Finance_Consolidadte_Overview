import { Nav } from "@/components/nav";
import { requireSession } from "@/server/auth-guards";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-screen bg-background">
      <Nav user={session.user} />
      <div className="container mx-auto py-8">{children}</div>
    </div>
  );
}
