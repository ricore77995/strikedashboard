import { db } from "@/lib/db";
import { findCustomerByPhone } from "@/lib/yogo/lookup";
import {
  deleteSignup,
  isCancellable,
  listFutureSignups,
  parseClassStart,
  type YogoSignup,
} from "@/lib/yogo/signups";
import { sendText, sendButton, sendList } from "@/lib/wa/meta";
import {
  renderAgendaList,
  renderConfirmCancel,
  type AgendaItem,
  type SignupLite,
  type YogoClassLite,
} from "@/lib/wa/render";
import { parseDateTime } from "@/lib/wa/parser";
import { resetToIdle, transition, ttlFromNow, type SessionRow } from "@/lib/wa/session";
import { removeSongOnCancel } from "@/lib/wa/handlers/song-request";
import { endInteraction } from "@/lib/wa/handlers/menu";

const NO_PLAN_LOOKUP = "Não te encontrámos no sistema. Escreve directamente ao Marcelo.";
const NO_SIGNUPS = "Não tens aulas marcadas.";
const CANCELLED_OK = "Cancelado.";
const ERR_NOT_FOUND = "Aula já não está disponível para cancelar.";
const ERR_SERVER = "Sistema temporariamente indisponível. Tenta outra vez em 1min.";
const ERR_RACE = "Outra mensagem cruzou-se com esta. Diz cancelar para começar de novo.";

const FUTURE_LOOKAHEAD_DAYS = 14;

export async function handleCancelar(session: SessionRow): Promise<void> {
  const phoneE164 = session.phoneE164;
  const customer = await findCustomerByPhone(phoneE164);
  if (!customer) {
    await db.waEvent.create({ data: { kind: "LOOKUP_MISS", phoneE164 } });
    await sendText(phoneE164, NO_PLAN_LOOKUP);
    await endInteraction(session, phoneE164);
    return;
  }

  const from = isoDate(0);
  const to = isoDate(FUTURE_LOOKAHEAD_DAYS);
  const all = await listFutureSignups(customer.id, from, to);
  // Build the agenda items: include EVERY future signup, but mark each as
  // cancellable or locked. The renderer turns locked items into ⏰ rows.
  const now = new Date();
  const items: AgendaItem[] = all
    .filter((s) => !s.cancelled_at && typeof s.class === "object")
    .map((s) => ({
      ...toSignupLite(s),
      cancellable: isCancellable(s, now),
    }));

  if (items.length === 0) {
    await sendText(phoneE164, NO_SIGNUPS);
    await endInteraction(session, phoneE164);
    return;
  }

  // All future signups are inside the 2h cutoff — show a useful message
  // instead of a list of ⏰ rows the aluno cannot act on.
  if (items.every((i) => !i.cancellable)) {
    await sendText(phoneE164, "Não tens aulas canceláveis de momento (corte 2h antes da aula).");
    await endInteraction(session, phoneE164);
    return;
  }

  // N=1 cancellable + 0 locked: skip the list and ask confirm directly.
  if (items.length === 1 && items[0].cancellable) {
    const t = await transition(session, {
      state: "AWAIT_CONFIRM_CANCEL",
      pendingSignupId: items[0].id,
      expiresAt: ttlFromNow(),
    });
    if (!t.ok) {
      await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164 } });
      return;
    }
    await sendButton(phoneE164, renderConfirmCancel(items[0]));
    return;
  }

  // N=2..10 interactive list (mixed eligibility); >10 → free-text DD/MM HH:MM.
  const payload = renderAgendaList(items, now);
  if (payload.type === "text") {
    const t = await transition(session, {
      state: "AWAIT_CANCEL_PICK",
      pendingSignupId: null,
      expiresAt: ttlFromNow(),
    });
    if (!t.ok) {
      await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164 } });
      return;
    }
    await sendText(phoneE164, payload.body);
    return;
  }

  const t = await transition(session, {
    state: "AWAIT_CANCEL_PICK",
    pendingSignupId: null,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164 } });
    return;
  }
  await sendList(phoneE164, payload);
}

export async function handleCancelPick(session: SessionRow, signupIdRaw: string): Promise<void> {
  // Locked rows come through with a `_locked` suffix (see renderAgendaList).
  // Aluno tapped a class that starts inside the 2h cutoff — refuse politely,
  // keep the session in AWAIT_CANCEL_PICK so they can pick a different row
  // from the same list without re-entering the agenda.
  if (signupIdRaw.endsWith("_locked")) {
    await sendText(session.phoneE164, "Esta aula começa em menos de 2h. Não dá para cancelar.");
    return;
  }

  const signupId = Number(signupIdRaw);
  if (!Number.isFinite(signupId)) {
    await sendText(session.phoneE164, "Selecção inválida. Diz cancelar para começar de novo.");
    return;
  }

  const customer = await findCustomerByPhone(session.phoneE164);
  if (!customer) {
    await db.waEvent.create({ data: { kind: "LOOKUP_MISS", phoneE164: session.phoneE164 } });
    await sendText(session.phoneE164, NO_PLAN_LOOKUP);
    await endInteraction(session, session.phoneE164);
    return;
  }

  const all = await listFutureSignups(customer.id, isoDate(0), isoDate(FUTURE_LOOKAHEAD_DAYS));
  const target = all.find((s) => s.id === signupId && isCancellable(s));
  if (!target) {
    await sendText(session.phoneE164, ERR_NOT_FOUND);
    await endInteraction(session, session.phoneE164);
    return;
  }

  const t = await transition(session, {
    state: "AWAIT_CONFIRM_CANCEL",
    pendingSignupId: signupId,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164: session.phoneE164 } });
    return;
  }

  await sendButton(session.phoneE164, renderConfirmCancel(toSignupLite(target)));
}

export async function handleCancelPickByText(session: SessionRow, text: string): Promise<void> {
  const parsed = parseDateTime(text);
  if (!parsed) {
    await sendText(
      session.phoneE164,
      "Formato inválido. Escreve a data e hora como 25/05 19:30, ou diz reserva para recomeçar.",
    );
    return;
  }
  const customer = await findCustomerByPhone(session.phoneE164);
  if (!customer) {
    await db.waEvent.create({ data: { kind: "LOOKUP_MISS", phoneE164: session.phoneE164 } });
    await sendText(session.phoneE164, NO_PLAN_LOOKUP);
    await endInteraction(session, session.phoneE164);
    return;
  }
  const all = await listFutureSignups(customer.id, isoDate(0), isoDate(FUTURE_LOOKAHEAD_DAYS));
  const match = all.find((s) => {
    if (!isCancellable(s)) return false;
    const klass = typeof s.class === "object" ? s.class : null;
    const start = parseClassStart(klass);
    if (!start) return false;
    return (
      start.getDate() === parsed.day &&
      start.getMonth() + 1 === parsed.month &&
      start.getHours() === parsed.hour &&
      start.getMinutes() === parsed.minute
    );
  });
  if (!match) {
    await sendText(session.phoneE164, "Não encontrei nenhuma marcação para essa data.");
    return;
  }
  const t = await transition(session, {
    state: "AWAIT_CONFIRM_CANCEL",
    pendingSignupId: match.id,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164: session.phoneE164 } });
    return;
  }
  await sendButton(session.phoneE164, renderConfirmCancel(toSignupLite(match)));
}

export async function handleConfirmCancel(session: SessionRow): Promise<void> {
  const phoneE164 = session.phoneE164;
  if (!session.pendingSignupId) {
    await sendText(phoneE164, ERR_RACE);
    await endInteraction(session, session.phoneE164);
    return;
  }

  // Resolve the Yogo class id before deleting so we can clean up the song request.
  // Best-effort: if lookup fails for any reason, yogoClassId stays undefined and
  // song removal is simply skipped.
  let yogoClassId: number | undefined;
  try {
    const customer = await findCustomerByPhone(phoneE164);
    if (customer) {
      const signups = await listFutureSignups(customer.id, isoDate(0), isoDate(FUTURE_LOOKAHEAD_DAYS));
      const match = signups.find((s) => s.id === session.pendingSignupId);
      if (match && typeof match.class === "object" && match.class !== null) {
        yogoClassId = (match.class as { id: number }).id;
      }
    }
  } catch {
    // Non-fatal: carry on with cancellation.
  }

  const result = await deleteSignup(session.pendingSignupId);
  if (result.kind === "ok") {
    await db.waEvent.create({ data: { kind: "CANCEL_OK", phoneE164 } });
    await sendText(phoneE164, CANCELLED_OK);
    // Best-effort: remove the song request for this class if one exists.
    if (yogoClassId !== undefined) {
      try {
        await removeSongOnCancel(phoneE164, yogoClassId);
      } catch {
        // Never fail a cancel because of song removal.
      }
    }
  } else if (result.kind === "not_found") {
    await db.waEvent.create({
      data: { kind: "CANCEL_FAIL", phoneE164, meta: JSON.stringify({ subkind: "not_found" }) },
    });
    await sendText(phoneE164, ERR_NOT_FOUND);
  } else {
    await db.waEvent.create({
      data: { kind: "CANCEL_FAIL", phoneE164, meta: JSON.stringify({ status: result.status }) },
    });
    await sendText(phoneE164, ERR_SERVER);
  }
  await endInteraction(session, session.phoneE164);
}

export async function handleAbortCancel(session: SessionRow): Promise<void> {
  await sendText(session.phoneE164, "Ok, mantenho a marcação.");
  await endInteraction(session, session.phoneE164);
}

function toSignupLite(s: YogoSignup): SignupLite {
  const klass = (typeof s.class === "object" ? s.class : { id: 0, date: "", start_time: "" }) as YogoClassLite;
  return { id: s.id, klass };
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
