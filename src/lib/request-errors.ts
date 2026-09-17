type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
};

/**
 * A browser can close an SSR connection while refreshing or navigating away.
 * Node reports that normal cancellation as `Error: aborted` / `ECONNRESET`.
 */
export function isRequestAbort(error: unknown): boolean {
  let current = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) return false;
    visited.add(current);

    const candidate = current as ErrorLike;
    if (
      candidate.name === "AbortError" ||
      candidate.code === "ECONNRESET" ||
      candidate.message === "aborted"
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}