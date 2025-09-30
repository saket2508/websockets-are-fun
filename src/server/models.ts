// Translation layer between raw SQLite rows and the shared DTOs.
// We keep it isolated so persistence quirks never leak into the rest of the app.
import type {
  Channel,
  ChannelType,
  Guild,
  ISO8601Timestamp,
  Member,
  Message,
  PresenceStatus,
  Reaction,
  Snowflake,
  User,
} from "../shared/types";

// Normalise timestamps coming from SQLite (which may be strings or numbers).
export const ensureISO8601 = (value: string | number | Date): ISO8601Timestamp =>
  new Date(value).toISOString();

// --- Guild ---
export type GuildRow = {
  id: Snowflake;
  name: string;
  icon: string | null;
  created_at: string | number | Date;
  updated_at: string | number | Date;
};

export const mapGuildRow = (row: GuildRow): Guild => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  createdAt: ensureISO8601(row.created_at),
  updatedAt: ensureISO8601(row.updated_at),
});

// --- Channel ---
export type ChannelRow = {
  id: Snowflake;
  guild_id: Snowflake;
  parent_id: Snowflake | null;
  name: string;
  topic: string | null;
  position: number;
  type: ChannelType;
  archived: number;
  created_at: string | number | Date;
  updated_at: string | number | Date;
};

export const mapChannelRow = (row: ChannelRow): Channel => ({
  id: row.id,
  guildId: row.guild_id,
  parentId: row.parent_id,
  name: row.name,
  topic: row.topic,
  position: row.position,
  type: row.type,
  isArchived: Boolean(row.archived),
  createdAt: ensureISO8601(row.created_at),
  updatedAt: ensureISO8601(row.updated_at),
});

// --- User ---
export type UserRow = {
  id: Snowflake;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: PresenceStatus;
  created_at: string | number | Date;
  updated_at: string | number | Date;
};

export const mapUserRow = (row: UserRow): User => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  status: row.status,
  avatarUrl: row.avatar_url,
  createdAt: ensureISO8601(row.created_at),
  updatedAt: ensureISO8601(row.updated_at),
});

// --- Member ---
export type MemberRow = {
  user_id: Snowflake;
  guild_id: Snowflake;
  roles: string | null;
  nickname: string | null;
  joined_at: string | number | Date;
  muted: number;
};

export const mapMemberRow = (row: MemberRow): Member => ({
  userId: row.user_id,
  guildId: row.guild_id,
  roles: splitCsv(row.roles) as Snowflake[],
  nickname: row.nickname,
  joinedAt: ensureISO8601(row.joined_at),
  muted: Boolean(row.muted),
});

// --- Message ---
export type MessageRow = {
  id: Snowflake;
  guild_id: Snowflake;
  channel_id: Snowflake;
  author_id: Snowflake;
  content: string;
  reply_to_id: Snowflake | null;
  created_at: string | number | Date;
  updated_at: string | number | Date;
};

export const mapMessageRow = (row: MessageRow): Message => ({
  id: row.id,
  guildId: row.guild_id,
  channelId: row.channel_id,
  authorId: row.author_id,
  content: row.content,
  replyToId: row.reply_to_id,
  createdAt: ensureISO8601(row.created_at),
  updatedAt: ensureISO8601(row.updated_at),
});

// --- Reaction ---
export type ReactionRow = {
  message_id: Snowflake;
  emoji: string;
  author_id: Snowflake;
  created_at: string | number | Date;
};

export const mapReactionRow = (row: ReactionRow): Reaction => ({
  messageId: row.message_id,
  emoji: row.emoji,
  authorId: row.author_id,
  createdAt: ensureISO8601(row.created_at),
});

// Utility to split comma-separated role strings into arrays.
export const splitCsv = (value: string | null): string[] =>
  value ? value.split(",").map((part) => part.trim()).filter(Boolean) : [];
