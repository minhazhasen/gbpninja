// The app's SQLite database, through Node's built-in node:sqlite (Node 22.13+). No query engine binary and no thread pool:
// Prisma's engine started ~1 thread per CPU core, which filled the cPanel account's process limit (CloudLinux counts threads)
// and took PHP down for every site on it. prisma/schema.prisma stays the source of truth for the tables (npm run db:push
// locally, npm run db:sql → prisma/schema.sql, which the server runs on start); this file only reads and writes rows.
// DATABASE_URL: "file:./dev.db" (relative to prisma/, like Prisma) or "file:/absolute/path/app.db".
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

type SqliteModule = typeof import("node:sqlite");

function open(): DatabaseSync {
  const g = globalThis as unknown as { __gbpnDb?: DatabaseSync };
  if (g.__gbpnDb) return g.__gbpnDb;
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) throw new Error("DATABASE_URL must be a SQLite file: URL");
  const file = url.slice(5);
  // Loaded at runtime so the bundler leaves the built-in alone.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as SqliteModule;
  const conn = new DatabaseSync(path.isAbsolute(file) ? file : path.join(process.cwd(), "prisma", file));
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return (g.__gbpnDb = conn);
}

export interface GoogleTokenRow {
  purpose: string;
  email: string;
  name: string | null;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
type TokenData = Omit<GoogleTokenRow, "purpose" | "createdAt" | "updatedAt">;

// Prisma stored DATETIME as epoch milliseconds; new rows use ISO strings. Read both.
const date = (v: unknown) => new Date(typeof v === "number" || typeof v === "bigint" ? Number(v) : String(v));
const toRow = (r: Record<string, unknown> | undefined): GoogleTokenRow | null =>
  r
    ? {
        purpose: String(r.purpose),
        email: String(r.email),
        name: (r.name as string | null) ?? null,
        scope: String(r.scope),
        accessToken: String(r.accessToken),
        refreshToken: (r.refreshToken as string | null) ?? null,
        expiresAt: date(r.expiresAt),
        createdAt: date(r.createdAt),
        updatedAt: date(r.updatedAt),
      }
    : null;

/** Small Prisma-shaped API for the one table the app writes today (Google OAuth tokens per purpose). */
export const db = {
  /** Run raw SQL (schema creation on start-up). */
  exec(sql: string) {
    open().exec(sql);
  },
  googleToken: {
    async findUnique({ where }: { where: { purpose: string } }) {
      return toRow(open().prepare('SELECT * FROM "GoogleToken" WHERE "purpose" = ?').get(where.purpose) as Record<string, unknown> | undefined);
    },
    async upsert({ where, update }: { where: { purpose: string }; create: TokenData & { purpose: string }; update: TokenData }) {
      const now = new Date().toISOString();
      open()
        .prepare(
          `INSERT INTO "GoogleToken" ("purpose","email","name","scope","accessToken","refreshToken","expiresAt","createdAt","updatedAt")
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT("purpose") DO UPDATE SET "email"=excluded."email","name"=excluded."name","scope"=excluded."scope",
             "accessToken"=excluded."accessToken","refreshToken"=excluded."refreshToken","expiresAt"=excluded."expiresAt","updatedAt"=excluded."updatedAt"`,
        )
        .run(where.purpose, update.email, update.name, update.scope, update.accessToken, update.refreshToken, update.expiresAt.toISOString(), now, now);
    },
    async update({ where, data }: { where: { purpose: string }; data: { accessToken: string; expiresAt: Date } }) {
      open()
        .prepare('UPDATE "GoogleToken" SET "accessToken" = ?, "expiresAt" = ?, "updatedAt" = ? WHERE "purpose" = ?')
        .run(data.accessToken, data.expiresAt.toISOString(), new Date().toISOString(), where.purpose);
    },
    async delete({ where }: { where: { purpose: string } }) {
      open().prepare('DELETE FROM "GoogleToken" WHERE "purpose" = ?').run(where.purpose);
    },
  },
};
