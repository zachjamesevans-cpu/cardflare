type ClassValue = string | false | null | undefined;

/** Joins conditional class names. Deliberately tiny — no clsx dependency. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
