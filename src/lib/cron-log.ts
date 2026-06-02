import { db } from "@/lib/db";

/**
 * Wrap a cron handler with execution logging.
 * Logs to CronRunLog regardless of success or failure.
 * Logging failure is silently swallowed — the cron itself must not break.
 */
export async function withCronLog<T>(
  cronName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  let status = "success";
  let message: string | null = null;

  try {
    const result = await fn();
    message = typeof result === "string" ? result : JSON.stringify(result);
    return result;
  } catch (err) {
    status = "error";
    message = err instanceof Error ? err.message : "unknown error";
    throw err;
  } finally {
    const durationMs = Date.now() - startedAt.getTime();
    await db.cronRunLog
      .create({
        data: { cronName, status, message, durationMs, startedAt },
      })
      .catch(() => {
        /* swallow — don't fail the cron if logging fails */
      });
  }
}
