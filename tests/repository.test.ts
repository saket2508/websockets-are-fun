import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

const globals = globalThis as { __CHAT_DB_PATH__?: string };

let database: typeof import("../src/server/database");
let repository: typeof import("../src/server/repository");
let seedModule: typeof import("../scripts/seed");

beforeAll(async () => {
  globals.__CHAT_DB_PATH__ = `file:memdb-${Date.now()}.sqlite`;
  database = await import("../src/server/database");
  repository = await import("../src/server/repository");
  seedModule = await import("../scripts/seed");
});

beforeEach(() => {
  database.resetDatabase();
  database.runMigrations();
  seedModule.seedDatabase({ skipIfExists: false });
});

describe("repository", () => {
  test("createGuestSession creates user, session, and memberships", () => {
    const result = repository.createGuestSession("TerminalGuest");

    expect(result.user.username.startsWith("guest-")).toBe(true);
    expect(result.user.displayName).toBe("TerminalGuest");
    expect(result.guildIds.length).toBeGreaterThan(0);

    const membershipRow = database.db
      .query("SELECT COUNT(*) as count FROM members WHERE user_id = ?")
      .get(result.user.id) as { count: number };

    expect(membershipRow.count).toBe(result.guildIds.length);
  });

  test("fetchChannelHistory returns author and reactions", () => {
    const channelRow = database.db
      .query("SELECT id FROM channels ORDER BY position LIMIT 1")
      .get() as { id: string } | undefined;

    expect(channelRow).toBeDefined();
    if (!channelRow) {
      return;
    }

    const batch = repository.fetchChannelHistory({ channelId: channelRow.id, limit: 10 });

    expect(batch.channelId).toBe(channelRow.id);
    expect(batch.messages.length).toBeGreaterThan(0);

    const [first] = batch.messages;
    expect(first).toBeDefined();
    if (!first) {
      return;
    }

    expect(first.author.username.length).toBeGreaterThan(0);
    expect(Array.isArray(first.reactions)).toBe(true);
  });

  test("appendMessage persists content and can be retrieved", () => {
    const channelRow = database.db
      .query("SELECT id, guild_id FROM channels ORDER BY position LIMIT 1")
      .get() as { id: string; guild_id: string } | undefined;

    expect(channelRow).toBeDefined();
    if (!channelRow) {
      return;
    }

    const guest = repository.createGuestSession("Author");

    const message = repository.appendMessage({
      guildId: channelRow.guild_id,
      channelId: channelRow.id,
      authorId: guest.user.id,
      content: "Writing tests is fun",
    });

    expect(message.content).toBe("Writing tests is fun");

    const stored = database.db
      .query("SELECT content FROM messages WHERE id = ?")
      .get(message.id) as { content: string } | undefined;

    expect(stored?.content).toBe("Writing tests is fun");
  });

  test("listGuildBootstrap returns guild bundles for a user", () => {
    const guest = repository.createGuestSession("Bootstrapper");

    const bootstrap = repository.listGuildBootstrap(guest.user.id);

    expect(Array.isArray(bootstrap)).toBe(true);
    expect(bootstrap.length).toBeGreaterThan(0);
    expect(bootstrap[0]?.channels.length).toBeGreaterThan(0);
    expect(bootstrap[0]?.members.length).toBeGreaterThan(0);
  });
});
