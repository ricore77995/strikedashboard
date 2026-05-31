import { Suspense } from "react";
import { MeClient } from "./me-client";

/**
 * Public student self-service page. Authenticated by the `?t=<token>` magic
 * link sent over WhatsApp (verified by /api/strikelab/me). No login.
 * Route: /strikelab/me
 */
export default function StudentMePage() {
  return (
    <main className="min-h-screen bg-black">
      <Suspense fallback={<p className="text-zinc-500 text-sm text-center py-16">A carregar...</p>}>
        <MeClient />
      </Suspense>
    </main>
  );
}
