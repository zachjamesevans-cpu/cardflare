/**
 * Polite HTTP for card providers.
 *
 * OPTCG API is a free service that asks developers not to hammer it, so this
 * is deliberately conservative: one request at a time, a fixed pause between
 * them, and exponential backoff on failures that might pass.
 *
 * The distinction that matters is retryable versus not. Retrying a 404 or a
 * 400 forever is how a free API gets abused by accident, so only network
 * errors, timeouts, 408, 429 and 5xx are retried.
 */

export interface HttpOptions {
  /** Milliseconds to wait between successful requests. */
  spacingMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  /** Injected in tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  onProgress?: (message: string) => void;
}

const DEFAULTS = {
  spacingMs: 250,
  maxAttempts: 4,
  timeoutMs: 20_000,
};

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

/**
 * "fetch failed" with the reason attached.
 *
 * Node's fetch reports every network failure as the two words "fetch
 * failed" and keeps the actual reason — DNS, refused, reset, a TLS
 * complaint — on `cause`. That reason is the only thing a person at a
 * terminal can act on, so it is put back into the message.
 */
export function describeNetworkError(error: unknown, url: string): string {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  if (!(error instanceof Error)) return `Could not reach ${host}`;

  const cause = (error as { cause?: unknown }).cause;
  const detail =
    cause && typeof cause === "object"
      ? [(cause as { code?: unknown }).code, (cause as { message?: unknown }).message]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(": ")
      : "";

  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return `Timed out reaching ${host}`;
  }

  return detail
    ? `Could not reach ${host} (${detail})`
    : `Could not reach ${host} (${error.message})`;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A single-flight, paced JSON client.
 *
 * Requests are serialised through `queue` rather than fired concurrently.
 * Concurrency against a free endpoint buys very little — the sync is a
 * background script, not a user-facing path — and costs goodwill.
 */
export class ProviderHttp {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly spacingMs: number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly onProgress?: (message: string) => void;

  constructor(
    private readonly baseUrl: string,
    options: HttpOptions = {},
  ) {
    this.spacingMs = options.spacingMs ?? DEFAULTS.spacingMs;
    this.maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.sleep = options.sleep ?? defaultSleep;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onProgress = options.onProgress;
  }

  /**
   * Resolves a path against the configured base.
   *
   * Rejects anything that would leave the provider's origin. The sync is
   * server-side with network access, so a path that could be redirected
   * elsewhere is a server-side request forgery primitive — even though today's
   * paths are all internal constants.
   */
  private resolve(path: string): string {
    const url = new URL(path, this.baseUrl);
    const base = new URL(this.baseUrl);

    if (url.origin !== base.origin) {
      throw new ProviderHttpError(
        `Refusing to request ${url.origin}: outside the provider's origin.`,
        null,
        false,
      );
    }

    return url.toString();
  }

  async getJson<T = unknown>(path: string): Promise<T> {
    const run = this.queue.then(() => this.attempt<T>(this.resolve(path)));

    // Keep the chain alive regardless of this call's outcome.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private async attempt<T>(url: string): Promise<T> {
    let lastError: ProviderHttpError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            accept: "application/json",
            // Identifies the client honestly, so the operator can see who is
            // calling and get in touch rather than just blocking.
            "user-agent": "cardflare/1.0 (+https://cardflare.gg)",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const retryable = RETRYABLE_STATUSES.has(response.status);
          lastError = new ProviderHttpError(
            `HTTP ${response.status} for ${url}`,
            response.status,
            retryable,
          );

          if (!retryable) throw lastError;
        } else {
          await this.sleep(this.spacingMs);
          return (await response.json()) as T;
        }
      } catch (error) {
        if (error instanceof ProviderHttpError) {
          if (!error.retryable) throw error;
          lastError = error;
        } else {
          // Network failure or timeout. Worth another go.
          lastError = new ProviderHttpError(
            describeNetworkError(error, url),
            null,
            true,
          );
        }
      }

      if (attempt < this.maxAttempts) {
        const backoff = this.spacingMs * 2 ** attempt;
        this.onProgress?.(
          `Retrying in ${backoff}ms (attempt ${attempt + 1}/${this.maxAttempts})`,
        );
        await this.sleep(backoff);
      }
    }

    throw lastError ?? new ProviderHttpError(`Request failed for ${url}`, null, false);
  }
}
