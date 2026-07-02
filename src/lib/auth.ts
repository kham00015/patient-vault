import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { type SessionUser } from "./roles";

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

export type { SessionUser } from "./roles";
export {
  canWrite,
  canArchive,
  canHardDelete,
  canDelete,
  canManageUsers,
  canViewAudit,
  canManageScheduleReady,
  canWriteScheduleDocNotes,
} from "./roles";

function cookieSecure(override?: boolean) {
  if (override !== undefined) return override;
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return false;
}

export async function createSession(
  user: SessionUser,
  ipAddress?: string,
  userAgent?: string,
  options?: { secureCookie?: boolean }
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

  const jwt = await signSessionJwt(user, tokenHash, expiresAt);

  const cookieStore = await cookies();
  const secure = cookieSecure(options?.secureCookie);
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return jwt;
}

async function signSessionJwt(
  user: SessionUser,
  tokenHash: string,
  expiresAt: Date
) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: tokenHash,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());
}

function sessionCookieSecure() {
  return cookieSecure();
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

    // Sliding expiration — keep DB session and browser cookie in sync
    const newExpiry = new Date(Date.now() + getSessionTimeoutMs());
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiry },
    });

    const cookieStore = await cookies();
    const refreshedJwt = await signSessionJwt(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      sid,
      newExpiry
    );
    try {
      cookieStore.set(COOKIE_NAME, refreshedJwt, {
        httpOnly: true,
        secure: sessionCookieSecure(),
        sameSite: "lax",
        path: "/",
        expires: newExpiry,
      });
    } catch {
      // Server Components cannot always mutate cookies during render; session is still valid.
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  } catch {
    return null;
  }
}
