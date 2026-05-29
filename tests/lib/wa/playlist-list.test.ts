import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  sendTextMock,
  sendButtonMock,
  userBookingsNext24hMock,
  ensureClassPlaylistMock,
} = vi.hoisted(() => ({
  sendTextMock: vi.fn(),
  sendButtonMock: vi.fn(),
  userBookingsNext24hMock: vi.fn(),
  ensureClassPlaylistMock: vi.fn(),
}));

vi.mock("@/lib/wa/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wa/meta")>();
  return { ...actual, sendText: sendTextMock, sendButton: sendButtonMock };
});

vi.mock("@/lib/yogo/signups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/yogo/signups")>();
  return { ...actual, userBookingsNext24h: userBookingsNext24hMock };
});

vi.mock("@/lib/wa/handlers/song-request", () => ({
  ensureClassPlaylist: ensureClassPlaylistMock,
}));

import { handlePlaylistList } from "@/lib/wa/handlers/playlist-list";

const PHONE = "+351912345678";

const PLAYLIST_ROW = (yogoClassId: number, spotifyPlaylistId: string) => ({
  id: `cuid-${yogoClassId}`,
  yogoClassId,
  spotifyPlaylistId,
  requestCount: 0,
  locked: false,
  createdAt: new Date(),
});

describe("handlePlaylistList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    sendButtonMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  });

  it("no bookings → sends NO_CLASSES message then menu", async () => {
    userBookingsNext24hMock.mockResolvedValueOnce([]);

    await handlePlaylistList(PHONE);

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Sem aulas em grupo reservadas nas próximas 24h. Reserva uma com 'reserva' primeiro 🥷",
    );
    expect(sendButtonMock).toHaveBeenCalledOnce(); // sendMenu
    expect(ensureClassPlaylistMock).not.toHaveBeenCalled();
  });

  it("two bookings with playlists → message contains both class names and spotify URLs, then menu", async () => {
    userBookingsNext24hMock.mockResolvedValueOnce([
      { yogoClassId: 10, className: "Striking", startsAtIso: "2026-05-27T19:30:00.000Z" },
      { yogoClassId: 20, className: "BJJ", startsAtIso: "2026-05-27T21:00:00.000Z" },
    ]);
    ensureClassPlaylistMock
      .mockResolvedValueOnce(PLAYLIST_ROW(10, "playlist-abc"))
      .mockResolvedValueOnce(PLAYLIST_ROW(20, "playlist-xyz"));

    await handlePlaylistList(PHONE);

    const msg: string = sendTextMock.mock.calls[0][1];
    expect(msg).toContain("Striking");
    expect(msg).toContain("https://open.spotify.com/playlist/playlist-abc");
    expect(msg).toContain("BJJ");
    expect(msg).toContain("https://open.spotify.com/playlist/playlist-xyz");
    expect(sendButtonMock).toHaveBeenCalledOnce(); // sendMenu at end
  });

  it("bookings exist but ensureClassPlaylist returns null for all → sends NO_CLASSES then menu", async () => {
    userBookingsNext24hMock.mockResolvedValueOnce([
      { yogoClassId: 10, className: "Striking", startsAtIso: "2026-05-27T19:30:00.000Z" },
    ]);
    ensureClassPlaylistMock.mockResolvedValueOnce(null);

    await handlePlaylistList(PHONE);

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Sem aulas em grupo reservadas nas próximas 24h. Reserva uma com 'reserva' primeiro 🥷",
    );
    expect(sendButtonMock).toHaveBeenCalledOnce(); // sendMenu
  });

  it("mix: one booking ensures playlist, another doesn't → only includes the one with playlist", async () => {
    userBookingsNext24hMock.mockResolvedValueOnce([
      { yogoClassId: 10, className: "Striking", startsAtIso: "2026-05-27T19:30:00.000Z" },
      { yogoClassId: 20, className: "BJJ", startsAtIso: "2026-05-27T21:00:00.000Z" },
    ]);
    ensureClassPlaylistMock
      .mockResolvedValueOnce(PLAYLIST_ROW(10, "playlist-abc"))
      .mockResolvedValueOnce(null);

    await handlePlaylistList(PHONE);

    const msg: string = sendTextMock.mock.calls[0][1];
    expect(msg).toContain("Striking");
    expect(msg).toContain("https://open.spotify.com/playlist/playlist-abc");
    expect(msg).not.toContain("BJJ");
  });

  it("calls ensureClassPlaylist with each booking's yogoClassId", async () => {
    userBookingsNext24hMock.mockResolvedValueOnce([
      { yogoClassId: 42, className: "MMA", startsAtIso: "2026-05-27T19:30:00.000Z" },
    ]);
    ensureClassPlaylistMock.mockResolvedValueOnce(PLAYLIST_ROW(42, "playlist-mma"));

    await handlePlaylistList(PHONE);

    expect(ensureClassPlaylistMock).toHaveBeenCalledWith(42);
  });
});
