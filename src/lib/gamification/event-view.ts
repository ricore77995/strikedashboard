/**
 * Shared helpers for projecting stored gamification events into the shape the
 * UI consumes. Used by both the admin detail endpoint and the student
 * self-service endpoint.
 */

export interface ParsedEventPayload {
  className: string | null;
  boostsApplied: string[];
}

/** Safely parse a stored event payload, extracting only the fields the UI shows. */
export function parseEventPayload(raw: string | null): ParsedEventPayload {
  if (!raw) return { className: null, boostsApplied: [] };
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const className = typeof p.className === "string" ? p.className : null;
    const boostsApplied = Array.isArray(p.boostsApplied)
      ? p.boostsApplied.filter((b): b is string => typeof b === "string")
      : [];
    return { className, boostsApplied };
  } catch {
    return { className: null, boostsApplied: [] };
  }
}
