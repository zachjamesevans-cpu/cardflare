import { z } from "zod";

import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "./schema";

/**
 * What a card search will run: trimmed, single-spaced, 2 to 60
 * characters. Apart from schema.ts so the browser, which reads that
 * file's labels and limits, never downloads zod for them.
 */
export const cardQuerySchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(MIN_QUERY_LENGTH, `Type at least ${MIN_QUERY_LENGTH} characters.`)
      .max(MAX_QUERY_LENGTH, "That search is too long."),
  );
