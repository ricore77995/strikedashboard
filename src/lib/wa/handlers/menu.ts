import { sendButton, sendText } from "@/lib/wa/meta";
import { renderMenu, renderOutrosMenu } from "@/lib/wa/render";
import { resetToIdle, type SessionRow } from "@/lib/wa/session";

const CONTACTO_MSG = "Entre em contacto com o número de atendimento.";

// Top-of-funnel menu. Anything the aluno types in IDLE state triggers this
// (dispatch.ts routes here). The 3 buttons map 1:1 to existing flows via
// their `id` values: btn_reservar → handleReservar, btn_agenda →
// handleCancelar, btn_outros → handleOutros.
export async function sendMenu(phoneE164: string): Promise<void> {
  await sendButton(phoneE164, renderMenu());
}

// Reset session to IDLE and show the main menu. This is the kiosk-style
// terminator for every completed interaction — bookings, cancellations,
// song requests (accepted or rejected), etc.
//
// If the reset fails (race: another inbound flow already bumped the session
// version since this handler started), we DO NOT send the menu — that other
// flow owns the next message and showing the menu would be confusing.
export async function endInteraction(session: SessionRow, phoneE164: string): Promise<void> {
  const reset = await resetToIdle(session);
  if (reset.ok) {
    await sendMenu(phoneE164);
  }
}

// "Outros" button → interactive sub-menu with Playlist and Contacto options.
// No state change; the sub-menu buttons are handled via dispatch routing.
export async function handleOutros(phoneE164: string): Promise<void> {
  await sendButton(phoneE164, renderOutrosMenu());
}

// "Contacto" sub-option — static message for human hand-off.
export async function handleContacto(phoneE164: string): Promise<void> {
  await sendText(phoneE164, CONTACTO_MSG);
  await sendMenu(phoneE164);
}
