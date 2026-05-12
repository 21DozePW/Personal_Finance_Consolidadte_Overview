/**
 * Helper for safely serializing API payloads that contain `bigint` (e.g.
 * Prisma money columns) or `Date` values. JSON.stringify throws on bigint
 * by default; we coerce them to strings so the wire format is stable.
 */

export type Jsonable =
  | string
  | number
  | boolean
  | null
  | bigint
  | Date
  | Jsonable[]
  | { [key: string]: Jsonable };

export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  );
}
