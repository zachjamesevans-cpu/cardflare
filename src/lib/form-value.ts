/**
 * Reads a FormData field as a string.
 *
 * `FormData.get` returns `null` for an absent field and a `File` for a file
 * input. Passing either straight into a string schema produces
 * "expected string, received null" — an internal message, usually about the
 * wrong field, shown to the user. Coercing here means a missing field fails
 * its own validation rule with its own wording.
 *
 * Deliberately free of server-only imports so it is usable anywhere and
 * directly unit-testable.
 */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
