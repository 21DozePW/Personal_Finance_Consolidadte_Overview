/**
 * Dedup hashing for imported rows.
 *
 * Two strategies, evaluated in order:
 *   1. If the source file provides an externalId (e.g. OFX `FITID`), we use
 *      `(accountId, externalId)`. The Prisma unique constraint on
 *      `(accountId, externalId)` enforces this at the DB level too.
 *   2. Otherwise we hash `(accountId, occurredOn, amountMinor,
 *      merchantNormalized)`. We deliberately do NOT include the full
 *      description here — it's encrypted at rest, so the existing-row side
 *      of a comparison can't decrypt it cheaply. `merchantNormalized` is a
 *      plaintext, lowercased projection that we already write on every
 *      transaction and that gives enough specificity for re-import
 *      detection.
 *
 * The hash lives only at preview/commit time — it is not stored.
 */

import { createHash } from "node:crypto";

function normalizeForHash(d: string | null | undefined): string {
  if (!d) return "";
  return d.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

export function rowDedupKey(input: {
  accountId: string;
  externalId: string | null;
  occurredOn: string;
  amountMinor: bigint | string;
  merchantNormalized: string | null;
}): string {
  if (input.externalId) {
    return `ext:${input.accountId}:${input.externalId}`;
  }
  const hash = createHash("sha256");
  hash.update(input.accountId);
  hash.update("");
  hash.update(input.occurredOn);
  hash.update("");
  hash.update(input.amountMinor.toString());
  hash.update("");
  hash.update(normalizeForHash(input.merchantNormalized));
  return `h:${hash.digest("hex")}`;
}

export function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Build a merchant → categoryId map from historical transactions on the
 * account. The most-used category per merchant wins; ties broken by recency.
 */
export function buildCategorySuggester(
  history: Array<{
    merchantNormalized: string | null;
    categoryId: string | null;
    occurredOn: Date;
  }>,
): (merchant: string | null) => string | null {
  const counts = new Map<string, Map<string, { count: number; latest: number }>>();
  for (const t of history) {
    if (!t.merchantNormalized || !t.categoryId) continue;
    const inner = counts.get(t.merchantNormalized) ?? new Map();
    const slot = inner.get(t.categoryId) ?? { count: 0, latest: 0 };
    slot.count += 1;
    slot.latest = Math.max(slot.latest, t.occurredOn.getTime());
    inner.set(t.categoryId, slot);
    counts.set(t.merchantNormalized, inner);
  }
  return (merchant) => {
    if (!merchant) return null;
    const key = merchant.trim().toLowerCase().slice(0, 120);
    const inner = counts.get(key);
    if (!inner) return null;
    let bestId: string | null = null;
    let bestScore = -1;
    let bestLatest = 0;
    for (const [id, { count, latest }] of inner.entries()) {
      if (count > bestScore || (count === bestScore && latest > bestLatest)) {
        bestId = id;
        bestScore = count;
        bestLatest = latest;
      }
    }
    return bestId;
  };
}
