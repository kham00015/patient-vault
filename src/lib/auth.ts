import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Role, User } from "@prisma/client";

const COOKIE_NAME = "pv_session";
const SALT_ROUNDS = 12;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.includes("change-me")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-only-jwt-secret-min-32-characters!!");
  }
  return new TextEncoder().encode(secret);
}

function getSessionTimeoutMs() {
  const minutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? "30", 10);
  return minutes * 60 * 1000;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function createSession(
  user: SessionUser,
  ipAddress?: string,
  userAgent?: string
) {
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + getSessionTimeoutMs());

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  const jwt = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: tokenHash,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return jwt;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      const sid = payload.sid as string;
      await prisma.session.deleteMany({ where: { tokenHash: sid } });
    } catch {
      /* ignore invalid token */
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sid = payload.sid as string;
    const userId = payload.sub as string;

    const session = await prisma.session.findUnique({ where: { tokenHash: sid } });
    if (!session || session.expiresAt < new Date() || session.userId !== userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user?.isActive) return null;

    // Sliding expiration
    const newExpiry = new Date(Date.now() + getSessionTimeoutMs());
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiry },
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export function canWrite(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN" || role === "STAFF";
}

export function canDelete(role: Role) {
  return role === "ADMIN" || role === "CLINICIAN";
}

export function canManageUsers(role: Role) {
  return role === "ADMIN";
}

export function canViewAudit(role: Role) {
  return role === "ADMIN";
}
