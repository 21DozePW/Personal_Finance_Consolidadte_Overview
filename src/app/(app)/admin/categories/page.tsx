import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories } from "@/server/categories";
import { CategoryForm } from "./category-form";
import { RowActions } from "./row-actions";

export const metadata = { title: "Categories · Admin · Household Finance" };

export default async function CategoriesPage() {
  const all = await listCategories({ includeArchived: true });
  const topLevel = all
    .filter((c) => !c.parent)
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-muted-foreground">
          Income, expense, and transfer categories. Sub-categories must share their parent&rsquo;s
          kind. Archive when a category is no longer in use; deletion is only allowed when
          it&rsquo;s never been referenced.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
          <CardDescription>
            Pick a kind first; the parent dropdown filters to that kind.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryForm parents={topLevel} />
        </CardContent>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Name</th>
              <th className="px-5 py-3 text-left font-medium">Kind</th>
              <th className="px-5 py-3 text-left font-medium">Parent</th>
              <th className="px-5 py-3 text-right font-medium">Transactions</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {all.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            ) : (
              all.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={
                        c.kind === "INCOME"
                          ? "success"
                          : c.kind === "EXPENSE"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {c.kind}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {c.parent?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{c._count.transactions}</td>
                  <td className="px-5 py-3">
                    {c.isArchived ? (
                      <Badge variant="warning">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <RowActions
                      id={c.id}
                      name={c.name}
                      isArchived={c.isArchived}
                      canDelete={c._count.transactions === 0 && c._count.children === 0}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
