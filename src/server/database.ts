// Low-level database wiring: opens the SQLite connection, runs migrations, and exposes helpers
// used by the repository layer. All schema definitions live here.
import { Database } from "bun:sqlite";
import { ensureISO8601 } from "./models";
import type { ISO8601Timestamp } from "../shared/types";

type Migration = {
  id: number;
  name: string;
  statements: string;
};

// Allow tests to point the repository at an in-memory database by setting this global.
const databaseGlobals = globalThis as { __CHAT_DB_PATH__?: string };
const DATABASE_FILE = databaseGlobals.__CHAT_DB_PATH__ ?? Bun.env.CHAT_DB_PATH ?? "chat.sqlite";

export const db = new Database(DATABASE_FILE, { create: true });

// Enable referential integrity and WAL for better concurrency.
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

// Track applied migrations to guarantee idempotency.
db.exec(`CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`);

// Schema definition: this single migration brings the entire database up to date.
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init-schema",
    statements: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        status TEXT NOT NULL DEFAULT 'online',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        topic TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'text',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS members (
        guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        roles TEXT,
        nickname TEXT,
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        muted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reactions (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (message_id, emoji, author_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
      CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
    `,
  },
];

const hasMigrationRun = db.query("SELECT id FROM migrations WHERE id = ? LIMIT 1");
const insertMigration = db.query(
  "INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)",
);

// Bring the database up to date by applying any outstanding migrations.
export const runMigrations = (): void => {
  for (const migration of MIGRATIONS) {
    const result = hasMigrationRun.get(migration.id) as { id: number } | undefined;
    if (result) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.statements);
      insertMigration.run(migration.id, migration.name, now());
    });

    apply();
    console.log(`Applied migration ${migration.id}: ${migration.name}`);
  }
};

// Convenience helper for tests/CLI to drop all tables.
export const resetDatabase = (): void => {
  db.exec(`
    DROP TABLE IF EXISTS reactions;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS members;
    DROP TABLE IF EXISTS channels;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS guilds;
    DROP TABLE IF EXISTS users;
    DELETE FROM migrations;
  `);
};

export const now = (): ISO8601Timestamp => ensureISO8601(Date.now());

if (import.meta.main) {
  const args = new Set(Bun.argv.slice(2));

  if (args.has("--reset")) {
    resetDatabase();
    console.log("Database reset complete");
  }

  if (args.has("--migrate")) {
    runMigrations();
    console.log("Migrations applied");
  }
}
