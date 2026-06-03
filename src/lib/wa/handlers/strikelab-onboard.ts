import { db } from "@/lib/db";
import { sendText, sendButton } from "@/lib/wa/meta";
import { findCustomerByPhone, getYogoUserDetail } from "@/lib/yogo/lookup";
import { upsertIdentity, findByCustomerId } from "@/lib/gamification/identity";
import { applyConsent } from "@/lib/gamification/consent";
import { appendEvent } from "@/lib/gamification/event-log";
import { resetToIdle, transition, type SessionRow } from "@/lib/wa/session";
import { buildStudentLink } from "@/lib/gamification/student-link";
import { linkReferral } from "@/lib/gamification/referral";

/** Welcome message sent after onboarding completes (with or without referral code). */
const WELCOME =
  "Bem-vindo ao StrikeLab! 🎯🏆\n\n" +
  "A partir de agora, cada treino conta. Vais acumular pontos e subir de nível.\n\n" +
  "Boa sorte e bons treinos! 💪";

/**
 * StrikeLab onboarding state machine.
 *
 * IDLE → "strikelab" → CHECK_DOB → consent flow → referral code → IDLE
 *
 * DOB enforcement (P15):
 *   - No Yogo customer → "fala com o Marcelo"
 *   - DOB null in Yogo → refuse, ask to update in Yogo
 *   - DOB < 13yr → excluded
 *   - DOB 13-17 → parental consent required
 *   - DOB ≥ 18 → normal 4-toggle consent
 */

const MIN_AGE = 13;
const ADULT_AGE = 18;

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Entry point: user types "strikelab" in IDLE state. */
export async function handleStrikelabOnboard(session: SessionRow): Promise<void> {
  const phone = session.phoneE164;

  // 1. Find Yogo customer by phone
  const customer = await findCustomerByPhone(phone);
  if (!customer) {
    await sendText(
      phone,
      "Não encontrei o teu perfil no sistema. Fala com o Marcelo na recepção para te registarem primeiro.",
    );
    return;
  }

  // 2. Check if already onboarded
  const existing = await findByCustomerId(customer.id);
  if (existing?.optInAt && existing.consentTraining) {
    await sendText(phone, "Já estás inscrito no StrikeLab! 💪 Vamos treinar.");
    return;
  }

  // 3. Fetch DOB from Yogo
  const userDetails = await getYogoUserDetail(customer.id);
  const dob = userDetails?.date_of_birth;

  if (!dob) {
    await sendText(
      phone,
      "Para participares preciso de confirmar a tua idade. Fala com o Marcelo na recepção — ele actualiza a tua data de nascimento no sistema. Depois escreve 'strikelab' outra vez.",
    );
    return;
  }

  const age = computeAge(dob);

  if (age < MIN_AGE) {
    await sendText(
      phone,
      "Lamentamos — o StrikeLab é para idades 13+. Fala com a equipa se tiveres dúvidas.",
    );
    return;
  }

  // 4. Create/update identity with DOB
  const birthYear = new Date(dob).getFullYear();
  await upsertIdentity({
    customerId: customer.id,
    phoneE164: phone,
    email: customer.email,
  });

  // Update birthYear
  await db.gamificationIdentity.update({
    where: { customerId: customer.id },
    data: { birthYear },
  });

  if (age < ADULT_AGE) {
    // 5a. Minor → parental consent required
    const res = await transition(session, { state: "STRIKELAB_AWAIT_PARENTAL" });
    if (!res.ok) return;

    await sendText(
      phone,
      "Tens menos de 18 anos — precisas de autorização dos teus pais ou encarregado de educação. " +
        "Pede ao Marcelo na recepção para registar a autorização. Quando estiver feito, escreve 'strikelab' outra vez.",
    );
    return;
  }

  // 5b. Adult → consent flow
  const res = await transition(session, { state: "STRIKELAB_AWAIT_CONSENT" });
  if (!res.ok) return;

  await sendButton(phone, {
    type: "button",
    bodyText:
      "🏆 StrikeLab — Programa de Gamificação\n\n" +
      "Vais ganhar pontos por cada treino, subir de nível e ganhar prémios!\n\n" +
      "Para participar, preciso da tua autorização para:\n" +
      "• Usar os teus dados de treino (presenças, pontuação)\n\n" +
      "Aceitas participar?",
    buttons: [
      { id: "strikelab_accept", title: "Sim, quero participar!" },
      { id: "strikelab_decline", title: "Não, obrigado" },
    ],
  });
}

/**
 * "Os Meus Pontos" menu option — send the student their personal StrikeLab
 * progress link. No state change (kiosk-style; like Playlist/Contacto).
 *
 * Only onboarded + consented students get a link; the link is personal and
 * verified by /api/strikelab/me. Falls closed if the feature is unconfigured.
 */
export async function handleStrikelabMe(phoneE164: string): Promise<void> {
  const identity = await db.gamificationIdentity.findUnique({
    where: { phoneE164 },
  });

  if (!identity || !identity.optInAt || !identity.consentTraining) {
    await sendText(
      phoneE164,
      "Ainda não estás no StrikeLab! Escreve 'strikelab' para te inscreveres e começares a ganhar pontos. 🏆",
    );
    return;
  }
  if (identity.erasedAt) {
    await sendText(phoneE164, "O teu perfil StrikeLab foi removido.");
    return;
  }

  const link = buildStudentLink(identity.customerId);
  if (!link) {
    await sendText(phoneE164, "O StrikeLab está a ser configurado. Tenta mais tarde. 🙏");
    return;
  }

  await sendText(
    phoneE164,
    `🏆 A tua evolução StrikeLab:\n\n${link}\n\nEste link é pessoal — não o partilhes.`,
  );
}

/** Handle consent response buttons. */
export async function handleStrikelabConsent(
  session: SessionRow,
  buttonId: string,
): Promise<void> {
  const phone = session.phoneE164;

  if (buttonId === "strikelab_decline") {
    await resetToIdle(session);
    await sendText(phone, "Sem problema! Se mudares de ideia, escreve 'strikelab'.");
    return;
  }

  if (buttonId === "strikelab_accept") {
    // Find identity by phone
    const identity = await db.gamificationIdentity.findUnique({
      where: { phoneE164: phone },
    });

    if (!identity) {
      await resetToIdle(session);
      await sendText(phone, "Ocorreu um erro. Tenta novamente escrevendo 'strikelab'.");
      return;
    }

    // Apply consent — all 4 toggles for simplicity (Phase 0)
    await applyConsent(identity.customerId, {
      training: true,
      ugc: false,
      realName: false,
      broadcasts: false,
    });

    // Emit identity_created event
    await appendEvent({
      customerId: identity.customerId,
      eventType: "identity_created",
      payloadJson: { source: "bot_onboarding", phone },
      source: "bot",
      idempotencyKey: `identity_created:${identity.customerId}`,
    });

    // Ask for referral code before welcoming
    const res = await transition(session, { state: "STRIKELAB_AWAIT_REFERRAL" });
    if (!res.ok) {
      // Race condition — fall through to welcome
      await resetToIdle(session);
      await sendText(phone, WELCOME);
      return;
    }

    await sendText(
      phone,
      "Tens um código de indicação de um amigo? 😊\n" +
        "Responde com o código ou escreve 'não'.",
    );
    return;
  }
}

/** Handle referral code input during onboarding. */
export async function handleStrikelabReferral(
  session: SessionRow,
  text: string,
): Promise<void> {
  const phone = session.phoneE164;
  const trimmed = text.trim().toLowerCase();

  // Detect "não" / skip responses
  if (["não", "nao", "n", "no", "skip", "nao tenho"].includes(trimmed)) {
    await resetToIdle(session);
    await sendText(phone, WELCOME);
    return;
  }

  // Find identity for this phone
  const identity = await db.gamificationIdentity.findUnique({
    where: { phoneE164: phone },
  });
  if (!identity) {
    await resetToIdle(session);
    await sendText(phone, WELCOME);
    return;
  }

  // Try to link referral code
  const result = await linkReferral(text.trim(), identity.customerId);
  await resetToIdle(session);

  if (result.ok) {
    await sendText(
      phone,
      "Código aceite! O teu amigo vai ganhar bónus. 🎁\n\n" + WELCOME,
    );
  } else {
    await sendText(
      phone,
      "Código não encontrado. Sem problema!\n\n" + WELCOME,
    );
  }
}

/** Handle parental consent confirmation (from admin/manual flow). */
export async function handleStrikelabParental(
  session: SessionRow,
  buttonId: string,
): Promise<void> {
  const phone = session.phoneE164;

  if (buttonId === "strikelab_parental_done") {
    // Re-trigger the full flow — will now detect parental consent ref
    await resetToIdle(session);
    return handleStrikelabOnboard({ ...session, state: "IDLE" });
  }

  // Cancel
  await resetToIdle(session);
  await sendText(phone, "Sem problema! Quando os teus pais autorizarem, escreve 'strikelab'.");
}
