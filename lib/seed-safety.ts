const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertDestructiveSeedAllowed(
  databaseUrl: string | undefined,
  allowDestructiveSeed = process.env.ALLOW_DESTRUCTIVE_SEED
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  if (LOOPBACK_HOSTS.has(target.hostname)) return;
  if (allowDestructiveSeed === "true") return;

  throw new Error(
    `Refusing to clear non-local database host "${target.hostname}". ` +
      "Set ALLOW_DESTRUCTIVE_SEED=true only when replacing that database is intentional."
  );
}
