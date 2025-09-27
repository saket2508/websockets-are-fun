// Central domain contracts shared across the server and terminal client.
// These types represent the "clean" DTOs that leave the database layer.
export type Snowflake = string;
export type ISO8601Timestamp = string;

// Presence state mirrors Discord's basic status options.
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

// Authenticated user identity exposed to clients.
export type User = {
  id: Snowflake;
  username: string;
  displayName: string | null;
  status: PresenceStatus;
  avatarUrl: string | null;
  createdAt: ISO8601Timestamp;
  updatedAt: ISO8601Timestamp;
};

// Guild (aka server) container for channels and members.
export type Guild = {
  id: Snowflake;
  name: string;
  icon: string | null;
  createdAt: ISO8601Timestamp;
  updatedAt: ISO8601Timestamp;
};

export type ChannelType = "text" | "thread" | "voice";

// Chat channel metadata used to render navigation trees.
export type Channel = {
  id: Snowflake;
  guildId: Snowflake;
  parentId: Snowflake | null;
  name: string;
  topic: string | null;
  position: number;
  type: ChannelType;
  isArchived: boolean;
  createdAt: ISO8601Timestamp;
  updatedAt: ISO8601Timestamp;
};

// Immutable snapshot of a message delivered to clients.
export type Message = {
  id: Snowflake;
  guildId: Snowflake;
  channelId: Snowflake;
  authorId: Snowflake;
  content: string;
  replyToId: Snowflake | null;
  createdAt: ISO8601Timestamp;
  updatedAt: ISO8601Timestamp;
};

export type MessageEmbed = {
  title: string;
  description: string | null;
  url: string | null;
};

export type MessageAttachment = {
  id: Snowflake;
  messageId: Snowflake;
  filename: string;
  url: string;
  contentType: string | null;
  sizeBytes: number;
};

// Emoji reaction summary for a message.
export type Reaction = {
  messageId: Snowflake;
  emoji: string;
  authorId: Snowflake;
  createdAt: ISO8601Timestamp;
};

// Membership extension that carries guild-scoped state.
export type Member = {
  userId: Snowflake;
  guildId: Snowflake;
  roles: Snowflake[];
  nickname: string | null;
  joinedAt: ISO8601Timestamp;
  muted: boolean;
};

// Thread metadata (stored as channels but modeled separately here for clarity).
export type Thread = {
  id: Snowflake;
  guildId: Snowflake;
  parentChannelId: Snowflake;
  name: string;
  archivedAt: ISO8601Timestamp | null;
  createdAt: ISO8601Timestamp;
  updatedAt: ISO8601Timestamp;
};

export type CommandName =
  | "help"
  | "nick"
  | "join"
  | "leave"
  | "thread"
  | "dm"
  | "react"
  | "edit"
  | "delete"
  | "reply"
  | "history";

// Canonical representation of a slash command invocation.
export type SlashCommand = {
  name: CommandName;
  arguments: Record<string, string | number | boolean | null>;
};

// Envelope for messages leaving the client (future-proofed for more actions).
export type OutboundMessage =
  | { type: "command"; payload: SlashCommand }
  | {
      type: "message";
      payload: { channelId: Snowflake; content: string; replyToId: Snowflake | null };
    };

// Presence change event payload.
export type PresenceEvent = {
  userId: Snowflake;
  status: PresenceStatus;
  updatedAt: ISO8601Timestamp;
};

// Paginated history batch returned from server for catch-up scenarios.
export type HistoricalMessageBatch = {
  channelId: Snowflake;
  messages: Array<Message & { author: User; reactions: Reaction[] }>;
  fetchedAt: ISO8601Timestamp;
};

// Server → client gateway events delivered over the WebSocket.
export type GatewayServerEvent =
  | { type: "connection_ack"; sessionId: Snowflake; user: User }
  | { type: "guild_bootstrap"; guild: Guild; channels: Channel[]; members: Member[] }
  | { type: "history_batch"; batch: HistoricalMessageBatch }
  | { type: "message_created"; message: Message; author: User; reactions: Reaction[]; clientId?: Snowflake }
  | { type: "reactions_updated"; messageId: Snowflake; channelId: Snowflake; reactions: Reaction[] }
  | { type: "message_updated"; message: Message; clientRequestId?: string }
  | { type: "message_deleted"; messageId: Snowflake; channelId: Snowflake; clientRequestId?: string }
  | { type: "presence_updated"; presence: PresenceEvent }
  | {
      type: "typing_started";
      channelId: Snowflake;
      userId: Snowflake;
      expiresAt: ISO8601Timestamp;
    }
  | { type: "typing_stopped"; channelId: Snowflake; userId: Snowflake }
  | { type: "command_error"; command: CommandName; error: string; clientId?: Snowflake };

// Client → server gateway intents.
export type GatewayClientEvent =
  | { type: "auth_init"; token: string | null }
  | { type: "join_channel"; channelId: Snowflake; limit?: number }
  | { type: "leave_channel"; channelId: Snowflake }
  | {
      type: "send_message";
      channelId: Snowflake;
      content: string;
      replyToId?: Snowflake | null;
      clientId?: Snowflake;
    }
  | { type: "toggle_reaction"; messageId: Snowflake; emoji: string }
  | {
      type: "edit_message";
      messageId: Snowflake;
      content: string;
      clientRequestId?: string;
    }
  | {
      type: "delete_message";
      messageId: Snowflake;
      clientRequestId?: string;
    }
  | { type: "emit_command"; command: SlashCommand }
  | { type: "ack_history"; channelId: Snowflake; messageIds: Snowflake[] }
  | { type: "typing_start"; channelId: Snowflake }
  | { type: "typing_stop"; channelId: Snowflake };

export type HistoryRequest = {
  channelId: Snowflake;
  before?: ISO8601Timestamp;
  limit?: number;
};
