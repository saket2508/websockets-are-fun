// Developer utility: populate the SQLite database with a demo guild, channels, users, and messages.
// The repository tests also reuse this logic for deterministic fixtures.
import { customAlphabet } from "nanoid";
import type { SQLQueryBindings } from "bun:sqlite";
import { db, now, resetDatabase, runMigrations } from "../src/server/database";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const makeId = customAlphabet(alphabet, 18);

type InsertableEntity = Record<string, SQLQueryBindings | undefined>;

const insert = (table: string, entity: InsertableEntity) => {
  const keys = Object.keys(entity);
  const columns = keys.map((key) => `"${key}"`).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((key) => (entity[key] ?? null) as SQLQueryBindings);

  const statement = db.query(
    `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
  );

  statement.run(...values);
};

const applySeedData = () => {
  const guildId = makeId();
  const generalChannelId = makeId();
  const devTalkChannelId = makeId();

  const aliceId = makeId();
  const bobId = makeId();
  const charlieId = makeId();

  const createdAt = now();

  const users: InsertableEntity[] = [
    { id: aliceId, username: "alice", display_name: "Alice", avatar_url: null, status: "online", created_at: createdAt, updated_at: createdAt },
    { id: bobId, username: "bob", display_name: "Bob", avatar_url: null, status: "idle", created_at: createdAt, updated_at: createdAt },
    { id: charlieId, username: "charlie", display_name: "Charlie", avatar_url: null, status: "dnd", created_at: createdAt, updated_at: createdAt },
  ];

  const guild: InsertableEntity = {
    id: guildId,
    name: "Terminal Titans",
    icon: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const channels: InsertableEntity[] = [
    { id: generalChannelId, guild_id: guildId, parent_id: null, name: "general", topic: "General chatter", position: 0, type: "text", archived: 0, created_at: createdAt, updated_at: createdAt },
    { id: devTalkChannelId, guild_id: guildId, parent_id: null, name: "dev-talk", topic: "Discuss builds and bugs", position: 1, type: "text", archived: 0, created_at: createdAt, updated_at: createdAt },
  ];

  const members: InsertableEntity[] = [
    { guild_id: guildId, user_id: aliceId, roles: "", nickname: "TerminalQueen", joined_at: createdAt, muted: 0 },
    { guild_id: guildId, user_id: bobId, roles: "", nickname: null, joined_at: createdAt, muted: 0 },
    { guild_id: guildId, user_id: charlieId, roles: "", nickname: null, joined_at: createdAt, muted: 0 },
  ];

  const welcomeMessage: InsertableEntity = {
    id: makeId(),
    guild_id: guildId,
    channel_id: generalChannelId,
    author_id: aliceId,
    content: "Welcome to Terminal Titans!",
    reply_to_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const excitedMessage: InsertableEntity = {
    id: makeId(),
    guild_id: guildId,
    channel_id: generalChannelId,
    author_id: bobId,
    content: "Hey team, excited to build this TUI!",
    reply_to_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const devLogMessage: InsertableEntity = {
    id: makeId(),
    guild_id: guildId,
    channel_id: devTalkChannelId,
    author_id: charlieId,
    content: "I pushed a prototype for the layout renderer.",
    reply_to_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const reactions: InsertableEntity[] = [
    { message_id: String(welcomeMessage.id), emoji: "🔥", author_id: bobId, created_at: createdAt },
    { message_id: String(excitedMessage.id), emoji: "✅", author_id: aliceId, created_at: createdAt },
  ];

  users.forEach((user) => insert("users", user));
  insert("guilds", guild);
  channels.forEach((channel) => insert("channels", channel));
  members.forEach((member) => insert("members", member));
  insert("messages", welcomeMessage);
  insert("messages", excitedMessage);
  insert("messages", devLogMessage);
  reactions.forEach((reaction) => insert("reactions", reaction));
};

export const seedDatabase = ({ skipIfExists = true } = {}) => {
  runMigrations();

  if (skipIfExists) {
    const countStmt = db.query("SELECT COUNT(*) as count FROM guilds");
    const existingGuilds = countStmt.get() as { count: number } | undefined;
    if (existingGuilds && existingGuilds.count > 0) {
      return { inserted: false };
    }
  }

  const seeder = db.transaction(applySeedData);
  seeder();
  return { inserted: true };
};

const main = async () => {
  const args = new Set(Bun.argv.slice(2));

  if (args.has("--reset")) {
    resetDatabase();
    console.log("Database reset");
  }

  const result = seedDatabase();
  if (result.inserted) {
    console.log("Seed data inserted");
  } else {
    console.log("Database already seeded; skipping");
  }
};

if (import.meta.main) {
  await main();
}
