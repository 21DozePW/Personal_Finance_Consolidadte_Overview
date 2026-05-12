export default function HomePage() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Household Finance</h1>
      <p className="max-w-xl text-muted-foreground">
        Private household financial management — CHF-consolidated, multi-currency. Phase 0
        scaffolding is in place. Authentication, accounts, and consolidated views arrive in later
        phases.
      </p>
      <div className="rounded-md border bg-card px-4 py-2 text-sm text-muted-foreground">
        Base currency: <span className="font-mono">CHF</span>
      </div>
    </main>
  );
}
