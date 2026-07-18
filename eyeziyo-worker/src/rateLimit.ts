/**
 * Lightweight D1-backed sliding-bucket rate limiter.
 *
 * Each (key, window) pair gets a row; the bucket size is implicit in the
 * `windowSeconds` argument. Cheap and good enough for auth-endpoint
 * abuse protection — not a precision tool.
 *
 * On every Nth call (probabilistically) we GC rows older than 1h, so the
 * table stays small without a scheduled job.
 */

interface MinimalDB {
  prepare(sql: string): {
    bind(...args: any[]): {
      run: () => Promise<any>;
      first: <T = any>() => Promise<T | null>;
    };
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window resets
}

export async function checkRateLimit(
  db: MinimalDB,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);

  // INSERT … ON CONFLICT increments atomically in D1/SQLite.
  await db.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`
  ).bind(key, windowStart).run();

  const row = await db.prepare(
    "SELECT count FROM rate_limits WHERE key = ? AND window_start = ?"
  ).bind(key, windowStart).first<{ count: number }>();

  const count = row?.count ?? 1;

  // GC ~1% of the time to keep the table trim.
  if (Math.random() < 0.01) {
    const cutoff = now - 3600;
    try {
      await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff).run();
    } catch {
      // best-effort
    }
  }

  if (count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: windowStart + windowSeconds - now,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retryAfter: 0,
  };
}

/** Extract a stable client identifier from a CF Worker request. */
export function clientKey(request: Request, prefix: string): string {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";
  return `${prefix}:${ip}`;
}
