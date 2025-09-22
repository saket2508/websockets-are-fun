// Repository functions encapsulate all database reads/writes and return rich DTOs.
// Think of this as our service layer that keeps the WebSocket/server code clean.
import { customAlphabet } from "nanoid";
import { db, now } from "./database";
import {
  ensureISO8601,
  mapChannelRow,
  mapGuildRow,
  mapMemberRow,
  mapMessageRow,
  mapReactionRow,
  mapUserRow,
  type ChannelRow,
  type GuildRow,
  type MemberRow,
  type MessageRow,
  type ReactionRow,
  type UserRow,
} from "./models";
import type {
  Channel,
  Guild,
  HistoricalMessageBatch,
  Message,
  Snowflake,
  User,
} from "../shared/types";

const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TOKEN_ALPHABET = `${ID_ALPHABET.toLowerCase()}${ID_ALPHABET}`;

const makeId = customAlphabet(ID_ALPHABET, 18);
const makeToken = customAlphabet(TOKEN_ALPHABET, 64);

export type Session = {
  id: Snowflake;
  token: string;
  userId: Snowflake;
  createdAt: string;
  expiresAt: string;
};

// Helper to capture the default guilds that every guest should join.
const getDefaultGuildIds = (): Snowflake[] => {
  const statement = db.query("SELECT id FROM guilds");
  const rows = statement.all() as Array<{ id: Snowflake }>;
  return rows.map((row) => row.id);
};

// Create a throwaway account and session token for new terminal users.
export const createGuestSession = (displayName?: string) => {
  const userId = makeId();
  const username = `guest-${userId.slice(-6).toLowerCase()}`;
  const sessionId = makeId();
  const token = makeToken();
  const createdAt = now();
  const expiresAt = ensureISO8601(Date.now() + 1000 * 60 * 60 * 24 * 7); // +7 days

  const guildIds = getDefaultGuildIds();

  const create = db.transaction(() => {
    db.query(
      `INSERT INTO users (id, username, display_name, avatar_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, username, displayName ?? null, null, "online", createdAt, createdAt);

    db.query(
      `INSERT INTO sessions (id, user_id, token, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, userId, token, createdAt, expiresAt);

    for (const guildId of guildIds) {
      db.query(
        `INSERT OR IGNORE INTO members (guild_id, user_id, roles, nickname, joined_at, muted)
         VALUES (?, ?, ?, ?, ?, 0)`
      ).run(guildId, userId, "", null, createdAt);
    }
  });

  create();

  const userRow: UserRow = {
    id: userId,
    username,
    display_name: displayName ?? null,
    avatar_url: null,
    status: "online",
    created_at: createdAt,
    updated_at: createdAt,
  };

  return {
    user: mapUserRow(userRow),
    session: {
      id: sessionId,
      token,
      userId,
      createdAt,
      expiresAt,
    },
    guildIds,
  };
};

// Resolve a session token coming from the client; returns null if expired or missing.
export const getSessionByToken = (token: string): Session | null => {
  const row = db
    .query(
      `SELECT id, user_id, token, created_at, expires_at FROM sessions WHERE token = ? LIMIT 1`,
    )
    .get(token) as
    | {
        id: Snowflake;
        user_id: Snowflake;
        token: string;
        created_at: string;
        expires_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const isExpired = new Date(row.expires_at).getTime() < Date.now();
  if (isExpired) {
    db.query(`DELETE FROM sessions WHERE id = ?`).run(row.id);
    return null;
  }

  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
};

export const getUserById = (userId: Snowflake): User | null => {
  const row = db
    .query(
      `SELECT id, username, display_name, avatar_url, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId) as UserRow | undefined;

  return row ? mapUserRow(row) : null;
};

export const listGuildsForUser = (userId: Snowflake): Guild[] => {
  const rows = db
    .query(
      `SELECT g.* FROM guilds g
       INNER JOIN members m ON m.guild_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.name ASC`,
    )
    .all(userId) as GuildRow[];

  return rows.map(mapGuildRow);
};

export const listChannelsForGuild = (guildId: Snowflake) => {
  const rows = db
    .query(
      `SELECT * FROM channels WHERE guild_id = ? ORDER BY position ASC, name ASC`,
    )
    .all(guildId) as ChannelRow[];

  return rows.map(mapChannelRow);
};

export const listMembersForGuild = (guildId: Snowflake) => {
  const rows = db
    .query(
      `SELECT * FROM members WHERE guild_id = ? ORDER BY joined_at ASC`,
    )
    .all(guildId) as MemberRow[];

  return rows.map(mapMemberRow);
};

export const getChannelById = (channelId: Snowflake): Channel | null => {
  const row = db
    .query(`SELECT * FROM channels WHERE id = ? LIMIT 1`)
    .get(channelId) as ChannelRow | undefined;

  return row ? mapChannelRow(row) : null;
};

// Trust-but-verify guard to ensure callers honour guild membership.
export const userHasAccessToGuild = (
  userId: Snowflake,
  guildId: Snowflake,
): boolean => {
  const row = db
    .query(`SELECT 1 FROM members WHERE guild_id = ? AND user_id = ? LIMIT 1`)
    .get(guildId, userId) as { 1: number } | undefined;
  return Boolean(row);
};

// Persist a new message and return the normalised DTO.
export const appendMessage = (input: {
  guildId: Snowflake;
  channelId: Snowflake;
  authorId: Snowflake;
  content: string;
  replyToId?: Snowflake | null;
}): Message => {
  const id = makeId();
  const createdAt = now();

  db.query(
    `INSERT INTO messages (id, guild_id, channel_id, author_id, content, reply_to_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.guildId, input.channelId, input.authorId, input.content, input.replyToId ?? null, createdAt, createdAt);

  const row: MessageRow = {
    id,
    guild_id: input.guildId,
    channel_id: input.channelId,
    author_id: input.authorId,
    content: input.content,
    reply_to_id: input.replyToId ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  return mapMessageRow(row);
};

// Row shape used by fetchChannelHistory's JOIN query.
type MessageHistoryRow = MessageRow & {
  author_username: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_status: string;
  author_created_at: string;
  author_updated_at: string;
};

// Load historical messages for a channel together with author info and reactions.
export const fetchChannelHistory = (input: {
  channelId: Snowflake;
  before?: string;
  limit?: number;
}): HistoricalMessageBatch => {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const bindings: Array<string | number> = [input.channelId];
  let beforeClause = "";

  if (input.before) {
    beforeClause = "AND m.created_at < ?";
    bindings.push(input.before);
  }

  bindings.push(limit);

  const rows = db
    .query(
      `SELECT m.*, u.username as author_username, u.display_name as author_display_name, u.avatar_url as author_avatar_url,
              u.status as author_status, u.created_at as author_created_at, u.updated_at as author_updated_at
       FROM messages m
       INNER JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ?
       ${beforeClause}
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(...bindings) as MessageHistoryRow[];

  const messageIds = rows.map((row) => row.id);
  const reactionRows = messageIds.length
    ? (db
        .query(
          `SELECT * FROM reactions WHERE message_id IN (${messageIds
            .map(() => "?")
            .join(", ")})`,
        )
        .all(...messageIds) as ReactionRow[])
    : [];

  const reactionsByMessage = new Map<Snowflake, ReactionRow[]>();
  for (const reaction of reactionRows) {
    const list = reactionsByMessage.get(reaction.message_id) ?? [];
    list.push(reaction);
    reactionsByMessage.set(reaction.message_id, list);
  }

  const messages = rows.map((row) => {
    const baseMessage = mapMessageRow(row);
    const authorRow: UserRow = {
      id: row.author_id,
      username: row.author_username,
      display_name: row.author_display_name,
      avatar_url: row.author_avatar_url,
      status: row.author_status as UserRow["status"],
      created_at: row.author_created_at,
      updated_at: row.author_updated_at,
    };

    const author = mapUserRow(authorRow);
    const reactions = (reactionsByMessage.get(row.id) ?? []).map(mapReactionRow);

    return {
      ...baseMessage,
      author,
      reactions,
    };
  });

  return {
    channelId: input.channelId,
    messages,
    fetchedAt: now(),
  };
};

// Convenience accessor for client bootstrap: guild, channels, members in one go.
export const listGuildBootstrap = (userId: Snowflake) => {
  const guilds = listGuildsForUser(userId);
  return guilds.map((guild) => ({
    guild,
    channels: listChannelsForGuild(guild.id),
    members: listMembersForGuild(guild.id),
  }));
};
