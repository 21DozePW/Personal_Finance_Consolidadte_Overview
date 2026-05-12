/**
 * Minimal `cn` helper for conditional Tailwind class merging.
 * shadcn/ui components later upgrade this to clsx + tailwind-merge; for now we
 * just join truthy strings to avoid pulling those deps into Phase 0.
 */
export function cn(...inputs: Array<string | number | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
