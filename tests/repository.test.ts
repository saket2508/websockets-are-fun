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

  test("updateMessageContent returns updated message for the author", () => {
    const channelRow = database.db
      .query("SELECT id, guild_id FROM channels ORDER BY position LIMIT 1")
      .get() as { id: string; guild_id: string } | undefined;

    expect(channelRow).toBeDefined();
    if (!channelRow) {
      return;
    }

    const guest = repository.createGuestSession("Editor");
    const original = repository.appendMessage({
      guildId: channelRow.guild_id,
      channelId: channelRow.id,
      authorId: guest.user.id,
      content: "Original content",
    });

    const updated = repository.updateMessageContent({
      messageId: original.id,
      authorId: guest.user.id,
      content: "Updated content",
    });

    expect(updated).not.toBeNull();
    expect(updated?.content).toBe("Updated content");

    const stored = database.db
      .query("SELECT content FROM messages WHERE id = ?")
      .get(original.id) as { content: string } | undefined;

    expect(stored?.content).toBe("Updated content");

    const otherUser = repository.createGuestSession("Intruder");
    const forbidden = repository.updateMessageContent({
      messageId: original.id,
      authorId: otherUser.user.id,
      content: "Hacked",
    });

    expect(forbidden).toBeNull();
  });

  test("deleteMessageById removes message for the author", () => {
    const channelRow = database.db
      .query("SELECT id, guild_id FROM channels ORDER BY position LIMIT 1")
      .get() as { id: string; guild_id: string } | undefined;

    expect(channelRow).toBeDefined();
    if (!channelRow) {
      return;
    }

    const guest = repository.createGuestSession("Destroyer");
    const message = repository.appendMessage({
      guildId: channelRow.guild_id,
      channelId: channelRow.id,
      authorId: guest.user.id,
      content: "Please delete me",
    });

    const removed = repository.deleteMessageById({
      messageId: message.id,
      authorId: guest.user.id,
    });

    expect(removed).not.toBeNull();
    expect(removed?.id).toBe(message.id);

    const stillThere = database.db
      .query("SELECT 1 FROM messages WHERE id = ?")
      .get(message.id) as { 1: number } | undefined | null;

    expect(stillThere).toBeNull();

    const otherUser = repository.createGuestSession("Snooper");
    const forbidden = repository.deleteMessageById({
      messageId: message.id,
      authorId: otherUser.user.id,
    });

    expect(forbidden).toBeNull();
  });

  test("toggleReaction adds and removes reactions", () => {
    const channelRow = database.db
      .query("SELECT id, guild_id FROM channels ORDER BY position LIMIT 1")
      .get() as { id: string; guild_id: string } | undefined;

    expect(channelRow).toBeDefined();
    if (!channelRow) {
      return;
    }

    const guest = repository.createGuestSession("Reactor");
    const message = repository.appendMessage({
      guildId: channelRow.guild_id,
      channelId: channelRow.id,
      authorId: guest.user.id,
      content: "React to me",
    });

    const firstToggle = repository.toggleReaction({
      messageId: message.id,
      emoji: ":thumbsup:",
      userId: guest.user.id,
    });

    expect(firstToggle.added).toBe(true);
    expect(firstToggle.reactions).toHaveLength(1);

    const secondToggle = repository.toggleReaction({
      messageId: message.id,
      emoji: ":thumbsup:",
      userId: guest.user.id,
    });

    expect(secondToggle.added).toBe(false);
    expect(secondToggle.reactions).toHaveLength(0);
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
