/**
 * Build/sanitize Postgres URLs so passwords with # ? @ etc. never break parsing.
 * Prisma reads process.env.DATABASE_URL at client init — call applyDatabaseUrl() first.
 */

function stripQuotes(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Re-encode user/password so reserved URL characters cannot truncate the string. */
export function sanitizeDatabaseUrl(raw: string): string {
  const url = stripQuotes(raw);
  const match = url.match(
    /^(postgresql|postgres):\/\/([^:/?#]+):([^@/?#]*)@([^?]+)(\?.*)?$/i
  );
  if (!match) {
    // If unencoded `#` was present, the password/host were already truncated in the file.
    if (url.includes("#") && !url.includes("%23")) {
      throw new Error(
        "DATABASE_URL contains an unencoded '#'. Re-write the password with URL encoding (or set DATABASE_HOST/USER/PASSWORD)."
      );
    }
    return url;
  }

  const [, protocol, user, password, hostAndDb, query = ""] = match;
  const safeUser = encodeURIComponent(decodeURIComponent(user));
  const safePassword = encodeURIComponent(decodeURIComponent(password));
  return `${protocol}://${safeUser}:${safePassword}@${hostAndDb}${query}`;
}

export function buildDatabaseUrlFromParts(): string | null {
  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  if (!host || !user || !password) return null;

  const port = process.env.DATABASE_PORT ?? "5432";
  const name = process.env.DATABASE_NAME ?? "patientvault";
  const sslmode = process.env.DATABASE_SSLMODE ?? "require";
  const safeUser = encodeURIComponent(user);
  const safePassword = encodeURIComponent(password);
  return `postgresql://${safeUser}:${safePassword}@${host}:${port}/${name}?sslmode=${sslmode}`;
}

export function resolveDatabaseUrl(): string {
  const fromParts = buildDatabaseUrlFromParts();
  if (fromParts) return fromParts;

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "Set DATABASE_URL or DATABASE_HOST + DATABASE_USER + DATABASE_PASSWORD"
    );
  }
  return sanitizeDatabaseUrl(raw);
}

/** Mutates process.env.DATABASE_URL for Prisma. Call once at module load. */
export function applyDatabaseUrl(): string {
  const url = resolveDatabaseUrl();
  process.env.DATABASE_URL = url;
  return url;
}
