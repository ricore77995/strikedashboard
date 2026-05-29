import { db } from "@/lib/db";
import { findCustomerByPhone } from "@/lib/yogo/lookup";
import { listClasses, bookableFor, createSignup } from "@/lib/yogo/signups";
import { sendText, sendList, sendButton } from "@/lib/wa/meta";
import { renderClassList, renderConfirmBook, type YogoClassLite } from "@/lib/wa/render";
import { transition, resetToIdle, ttlFromNow, type SessionRow } from "@/lib/wa/session";
import { offerSongRequest } from "@/lib/wa/handlers/song-request";
import { endInteraction } from "@/lib/wa/handlers/menu";

const FALLBACK_LOOKUP_MISS = "Não te encontrámos no sistema. Escreve directamente ao Marcelo.";
const NO_BOOKABLE = "Sem aulas disponíveis para reservar nas próximas 48h.";
const BOOKED_OK = "Reservado. Aparece 10min antes.";
const ERR_ALREADY = "Já estás inscrito nesta aula.";
const ERR_NO_PLAN = "Sem plano activo. Fala com o Marcelo.";
const ERR_SERVER = "Sistema temporariamente indisponível. Tenta outra vez em 1min.";
const ERR_RACE = "Outra mensagem cruzou-se com esta. Diz reserva para começar de novo.";

export async function handleReservar(session: SessionRow): Promise<void> {
  const phoneE164 = session.phoneE164;
  const customer = await findCustomerByPhone(phoneE164);
  if (!customer) {
    await db.waEvent.create({ data: { kind: "LOOKUP_MISS", phoneE164 } });
    await sendText(phoneE164, FALLBACK_LOOKUP_MISS);
    await endInteraction(session, phoneE164);
    return;
  }

  const today = isoDate(0);
  const tomorrow = isoDate(1);
  const all = await listClasses(today, tomorrow);
  const bookable = all.filter((k) => bookableFor(k, customer.id));

  const payload = renderClassList(bookable as YogoClassLite[], today, tomorrow);
  if (payload.type === "text") {
    await sendText(phoneE164, bookable.length === 0 ? NO_BOOKABLE : payload.body);
    await endInteraction(session, phoneE164);
    return;
  }

  const t = await transition(session, {
    state: "AWAIT_CLASS_PICK",
    pendingClassId: null,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164 } });
    return;
  }

  const send = await sendList(phoneE164, payload);
  if (!send.ok) {
    await db.waEvent
      .create({
        data: {
          kind: "SEND_FAIL",
          phoneE164,
          meta: JSON.stringify({
            where: "handleReservar.sendList",
            status: send.status,
            body: send.body.slice(0, 400),
            sectionCount: payload.sections.length,
            rowCount: payload.sections.reduce((n, s) => n + s.rows.length, 0),
          }),
        },
      })
      .catch(() => undefined);
  }
}

export async function handleClassPick(session: SessionRow, classIdRaw: string): Promise<void> {
  const classId = Number(classIdRaw);
  if (!Number.isFinite(classId)) {
    await sendText(session.phoneE164, "Selecção inválida. Diz reserva para começar de novo.");
    return;
  }

  // Re-fetch the class so the confirmation message has the live title + time.
  const today = isoDate(0);
  const tomorrow = isoDate(1);
  const all = await listClasses(today, tomorrow);
  const klass = all.find((k) => k.id === classId);
  if (!klass) {
    await sendText(session.phoneE164, "Aula já não está disponível. Diz reserva para ver as actuais.");
    await endInteraction(session, session.phoneE164);
    return;
  }

  const t = await transition(session, {
    state: "AWAIT_CONFIRM_BOOK",
    pendingClassId: classId,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent.create({ data: { kind: "SESSION_RACE", phoneE164: session.phoneE164 } });
    return;
  }

  await sendButton(session.phoneE164, renderConfirmBook(klass as YogoClassLite));
}

export async function handleConfirmBook(session: SessionRow): Promise<void> {
  const phoneE164 = session.phoneE164;
  if (!session.pendingClassId) {
    await sendText(phoneE164, ERR_RACE);
    await endInteraction(session, session.phoneE164);
    return;
  }

  const customer = await findCustomerByPhone(phoneE164);
  if (!customer) {
    await db.waEvent.create({ data: { kind: "LOOKUP_MISS", phoneE164 } });
    await sendText(phoneE164, FALLBACK_LOOKUP_MISS);
    await endInteraction(session, session.phoneE164);
    return;
  }

  const result = await createSignup(customer.id, session.pendingClassId);
  const phoneMeta = { phoneE164 };

  if (result.kind === "ok") {
    await db.waEvent.create({ data: { kind: "BOOKING_OK", ...phoneMeta } });
    await sendText(phoneE164, BOOKED_OK);
    try {
      await offerSongRequest(phoneE164, session.pendingClassId);
    } catch {
      // Best-effort offer — never fail a booking because of a song offer.
    }
  } else if (result.kind === "already_booked") {
    await db.waEvent.create({
      data: { kind: "BOOKING_OK", phoneE164, meta: JSON.stringify({ subkind: "already_booked" }) },
    });
    await sendText(phoneE164, ERR_ALREADY);
  } else if (result.kind === "no_plan") {
    await db.waEvent.create({
      data: { kind: "BOOKING_FAIL", phoneE164, meta: JSON.stringify({ subkind: "no_plan" }) },
    });
    await sendText(phoneE164, ERR_NO_PLAN);
  } else {
    await db.waEvent.create({
      data: { kind: "BOOKING_FAIL", phoneE164, meta: JSON.stringify({ status: result.status }) },
    });
    await sendText(phoneE164, ERR_SERVER);
  }

  await endInteraction(session, session.phoneE164);
}

export async function handleCancelBook(session: SessionRow): Promise<void> {
  await sendText(session.phoneE164, "Ok, reserva cancelada.");
  await endInteraction(session, session.phoneE164);
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
