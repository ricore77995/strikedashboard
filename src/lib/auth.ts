import { cookies } from "next/headers";
import type { Role } from "./constants";

export const COOKIE_NAME = "striker_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function validatePassword(password: string): Role | null {
  if (password === process.env.ADMIN_PWD) return "admin";
  if (password === process.env.SALES_PWD) return "sales";
  return null;
}

export async function createSession(role: Role): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<Role | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  if (!session) return null;
  if (session.value === "admin" || session.value === "sales") return session.value;
  return null;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
