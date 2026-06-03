import { db } from "@/lib/db";

export type WaSessionState =
  | "IDLE"
  | "AWAIT_CLASS_PICK"
  | "AWAIT_CONFIRM_BOOK"
  | "AWAIT_CANCEL_PICK"
  | "AWAIT_CONFIRM_CANCEL"
  | "AWAIT_SONG_INPUT"
  | "AWAIT_SONG_CONFIRM"
  | "AWAIT_SWAP_CONFIRM"
  | "STRIKELAB_AWAIT_CONSENT"
  | "STRIKELAB_AWAIT_PARENTAL"
  | "STRIKELAB_AWAIT_REFERRAL";

export interface SessionRow {
  phoneE164: string;
  state: string;
  pendingClassId: number | null;
  pendingSignupId: number | null;
  pendingSongClassId: number | null;
  pendingTrackId: string | null;
  expiresAt: Date | null;
  version: number;
}

export const SESSION_TTL_MS = 10 * 60 * 1000;

export function ttlFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

// loadSession ensures WaContact exists (FK requirement) and returns the
// current WaSession row, creating a default IDLE/version=0 row on first
// contact. Callers should treat expired sessions as IDLE via isExpired().
export async function loadSession(phoneE164: string): Promise<SessionRow> {
  await db.waContact.upsert({
    where: { phoneE164 },
    create: { phoneE164 },
    update: {},
  });
  return db.waSession.upsert({
    where: { phoneE164 },
    create: { phoneE164 },
    update: {},
  });
}

export function isExpired(row: SessionRow): boolean {
  return !!row.expiresAt && row.expiresAt.getTime() < Date.now();
}

export interface TransitionPatch {
  state?: WaSessionState;
  pendingClassId?: number | null;
  pendingSignupId?: number | null;
  pendingSongClassId?: number | null;
  pendingTrackId?: string | null;
  expiresAt?: Date | null;
}

export type TransitionResult =
  | { ok: true; session: SessionRow }
  | { ok: false; reason: "race" };

// Atomic state transition with optimistic version lock. updateMany scoped to
// (phoneE164, version) is a no-op when another inbound bumped the version
// since loadSession; callers should log WaEvent SESSION_RACE and bail.
export async function transition(current: SessionRow, patch: TransitionPatch): Promise<TransitionResult> {
  const result = await db.waSession.updateMany({
    where: { phoneE164: current.phoneE164, version: current.version },
    data: {
      ...patch,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return { ok: false, reason: "race" };
  const fresh = await db.waSession.findUniqueOrThrow({ where: { phoneE164: current.phoneE164 } });
  return { ok: true, session: fresh };
}

export async function resetToIdle(current: SessionRow): Promise<TransitionResult> {
  return transition(current, {
    state: "IDLE",
    pendingClassId: null,
    pendingSignupId: null,
    pendingSongClassId: null,
    pendingTrackId: null,
    expiresAt: null,
  });
}
