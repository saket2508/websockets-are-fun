import type { ServerWebSocket } from "bun";
import { z } from "zod";
import { runMigrations } from "./src/server/database";
import {
  appendMessage,
  createGuestSession,
  fetchChannelHistory,
  getChannelById,
  getMessageById,
  getSessionByToken,
  getUserById,
  listGuildBootstrap,
  updateMessageContent,
  deleteMessageById,
  toggleReaction,
  userHasAccessToGuild,
  type Session,
} from "./src/server/repository";
import type {
  GatewayClientEvent,
  GatewayServerEvent,
  ISO8601Timestamp,
  Snowflake,
  User,
} from "./src/shared/types";

runMigrations();

const HISTORY_ROUTE = /^\/api\/channels\/(?<channelId>[^/]+)\/history$/;
const GUEST_AUTH_ROUTE = "/api/auth/guest";
const CHANNEL_TOPIC_PREFIX = "channel";

const historyQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const guestRequestSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name must be at least 1 character")
      .max(32, "Display name must be at most 32 characters")
      .optional(),
  })
  .optional();

const clientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth_init"), token: z.string().nullable() }),
  z.object({
    type: z.literal("join_channel"),
    channelId: z.string(),
    limit: z.number().min(1).max(100).optional(),
  }),
  z.object({ type: z.literal("leave_channel"), channelId: z.string() }),
  z.object({
    type: z.literal("send_message"),
    channelId: z.string(),
    content: z.string().min(1),
    replyToId: z.string().nullable().optional(),
    clientId: z.string().optional(),
  }),
  z.object({ type: z.literal("toggle_reaction"), messageId: z.string(), emoji: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("edit_message"),
    messageId: z.string(),
    content: z.string().min(1),
    clientRequestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("delete_message"),
    messageId: z.string(),
    clientRequestId: z.string().optional(),
  }),
  z.object({ type: z.literal("emit_command"), command: z.any() }),
  z.object({
    type: z.literal("ack_history"),
    channelId: z.string(),
    messageIds: z.array(z.string()),
  }),
  z.object({ type: z.literal("typing_start"), channelId: z.string() }),
  z.object({ type: z.literal("typing_stop"), channelId: z.string() }),
]);

type ClientEvent = z.infer<typeof clientEventSchema>;

type WsContext = {
  session: Session;
  user: User;
  joinedChannels: Set<Snowflake>;
  typingChannels: Set<Snowflake>;
};

const toJsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const extractBearerToken = (req: Request, url: URL): string | null => {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const tokenParam = url.searchParams.get("token");
  return tokenParam ? tokenParam.trim() : null;
};

const parseClientEvent = (payload: string): ClientEvent | null => {
  try {
    const json = JSON.parse(payload) as GatewayClientEvent;
    const result = clientEventSchema.safeParse(json);
    if (!result.success) {
      console.warn("Rejected client payload", {
        payload,
        issues: result.error.issues,
      });
      return null;
    }
    return result.data;
  } catch (error) {
    console.error("Failed to parse client payload", error, { payload });
    return null;
  }
};

const serializeEvent = (event: GatewayServerEvent): string =>
  JSON.stringify(event);

const channelTopic = (channelId: Snowflake): string =>
  `${CHANNEL_TOPIC_PREFIX}:${channelId}`;

const TYPING_TIMEOUT_MS = 5_000;

const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const typingKey = (channelId: Snowflake, userId: Snowflake): string =>
  `${channelId}:${userId}`;

const server = Bun.serve({
  port: 3000,
  fetch: async (req, serverInstance) => {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === GUEST_AUTH_ROUTE) {
      const body = await req.json().catch(() => ({}));
      const parsed = guestRequestSchema.safeParse(body);

      if (!parsed.success) {
        return toJsonResponse(400, {
          error: parsed.error.issues.map((issue) => issue.message).join(", "),
        });
      }

      const { user, session } = createGuestSession(parsed.data?.displayName);

      return toJsonResponse(201, {
        user,
        session,
      });
    }

    const historyMatch = url.pathname.match(HISTORY_ROUTE);
    if (req.method === "GET" && historyMatch?.groups?.channelId) {
      const token = extractBearerToken(req, url);
      if (!token) {
        return toJsonResponse(401, { error: "Missing bearer token" });
      }

      const session = getSessionByToken(token);
      if (!session) {
        return toJsonResponse(401, { error: "Invalid or expired token" });
      }

      const channel = getChannelById(historyMatch.groups.channelId);
      if (!channel) {
        return toJsonResponse(404, { error: "Channel not found" });
      }

      if (!userHasAccessToGuild(session.userId, channel.guildId)) {
        return toJsonResponse(403, {
          error: "You do not have access to this channel",
        });
      }

      const queryValues = Object.fromEntries(url.searchParams.entries());
      const parsedQuery = historyQuerySchema.safeParse(queryValues);

      if (!parsedQuery.success) {
        return toJsonResponse(400, { error: "Invalid query parameters" });
      }

      const batch = fetchChannelHistory({
        channelId: channel.id,
        before: parsedQuery.data.before,
        limit: parsedQuery.data.limit,
      });

      return toJsonResponse(200, batch);
    }

    const token = extractBearerToken(req, url);
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const session = getSessionByToken(token);
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = getUserById(session.userId);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const success = serverInstance.upgrade(req, {
      data: {
        session,
        user,
        joinedChannels: new Set<Snowflake>(),
        typingChannels: new Set<Snowflake>(),
      } satisfies WsContext,
    });

    if (!success) {
      return new Response("Upgrade failed", { status: 400 });
    }

    return new Response(null, { status: 101 });
  },
  error(error) {
    console.error("Server error:", error);
    return new Response("Internal server error", { status: 500 });
  },
  websocket: {
    open(ws: ServerWebSocket<WsContext>) {
      const { user, session } = ws.data;
      console.log(`${user.username} connected with session ${session.id}`);

      const ack: GatewayServerEvent = {
        type: "connection_ack",
        sessionId: session.id,
        user,
      };

      ws.send(serializeEvent(ack));

      const bootstrap = listGuildBootstrap(user.id);
      for (const bundle of bootstrap) {
        const event: GatewayServerEvent = {
          type: "guild_bootstrap",
          guild: bundle.guild,
          channels: bundle.channels,
          members: bundle.members,
        };
        ws.send(serializeEvent(event));
      }
    },
    message(ws: ServerWebSocket<WsContext>, message) {
      if (typeof message !== "string") {
        console.warn("Received non-string payload from client");
        return;
      }

      const event = parseClientEvent(message);
      if (!event) {
        ws.send(
          serializeEvent({
            type: "command_error",
            command: "history",
            error: "Malformed client event",
          })
        );
        return;
      }

      switch (event.type) {
        case "auth_init": {
          ws.send(
            serializeEvent({
              type: "connection_ack",
              sessionId: ws.data.session.id,
              user: ws.data.user,
            })
          );
          break;
        }
        case "join_channel": {
          const channel = getChannelById(event.channelId);
          if (!channel) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "join",
                error: "Channel not found",
              })
            );
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, channel.guildId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "join",
                error: "You cannot join this channel",
              })
            );
            return;
          }

          const topic = channelTopic(channel.id);
          if (!ws.data.joinedChannels.has(channel.id)) {
            ws.data.joinedChannels.add(channel.id);
            ws.subscribe(topic);
          }

          const history = fetchChannelHistory({
            channelId: channel.id,
            limit: event.limit,
          });

          ws.send(
            serializeEvent({
              type: "history_batch",
              batch: history,
            })
          );
          break;
        }
        case "leave_channel": {
          const channelId = event.channelId as Snowflake;
          if (ws.data.joinedChannels.has(channelId)) {
            ws.data.joinedChannels.delete(channelId);
            ws.unsubscribe(channelTopic(channelId));
            ws.data.typingChannels.delete(channelId);
            clearTypingState(channelId, ws.data.user.id, { notify: true });
          }
          break;
        }
        case "send_message": {
          const channel = getChannelById(event.channelId);
          if (!channel) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "history",
                error: "Channel not found",
                clientId: event.clientId ?? undefined,
              })
            );
            return;
          }

          if (!ws.data.joinedChannels.has(channel.id)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "history",
                error: "Join the channel before sending messages",
                clientId: event.clientId ?? undefined,
              })
            );
            return;
          }

          ws.data.typingChannels.delete(channel.id);
          clearTypingState(channel.id, ws.data.user.id, { notify: true });

          const messageRecord = appendMessage({
            guildId: channel.guildId,
            channelId: channel.id,
            authorId: ws.data.user.id,
            content: event.content,
            replyToId: event.replyToId ?? null,
          });

          const payload: GatewayServerEvent = {
            type: "message_created",
            message: messageRecord,
            author: ws.data.user,
            reactions: [],
            clientId: event.clientId ?? undefined,
          };

          server.publish(channelTopic(channel.id), serializeEvent(payload));
          break;
        }
        case "toggle_reaction": {
          const messageRecord = getMessageById(event.messageId);
          if (!messageRecord) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "react",
                error: "Message not found",
              })
            );
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, messageRecord.guildId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "react",
                error: "You cannot react to this message",
              })
            );
            return;
          }

          if (!ws.data.joinedChannels.has(messageRecord.channelId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "react",
                error: "Join the channel before reacting",
              })
            );
            return;
          }

          const result = toggleReaction({
            messageId: messageRecord.id,
            emoji: event.emoji,
            userId: ws.data.user.id,
          });

          const payload: GatewayServerEvent = {
            type: "reactions_updated",
            messageId: messageRecord.id,
            channelId: messageRecord.channelId,
            reactions: result.reactions,
          };

          server.publish(channelTopic(messageRecord.channelId), serializeEvent(payload));
          break;
        }
        case "edit_message": {
          const messageRecord = getMessageById(event.messageId);
          if (!messageRecord) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "Message not found",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, messageRecord.guildId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "You cannot edit messages in this guild",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (!ws.data.joinedChannels.has(messageRecord.channelId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "Join the channel before editing",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (messageRecord.authorId !== ws.data.user.id) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "You can only edit your own messages",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          const trimmed = event.content.trim();
          if (trimmed.length === 0) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "Edited message cannot be empty",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          const updated = updateMessageContent({
            messageId: event.messageId,
            authorId: ws.data.user.id,
            content: trimmed,
          });

          if (!updated) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "edit",
                error: "Unable to edit the message",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          server.publish(
            channelTopic(updated.channelId),
            serializeEvent({
              type: "message_updated",
              message: updated,
              clientRequestId: event.clientRequestId ?? undefined,
            }),
          );
          break;
        }
        case "delete_message": {
          const messageRecord = getMessageById(event.messageId);
          if (!messageRecord) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "delete",
                error: "Message not found",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, messageRecord.guildId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "delete",
                error: "You cannot delete messages in this guild",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (!ws.data.joinedChannels.has(messageRecord.channelId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "delete",
                error: "Join the channel before deleting",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          if (messageRecord.authorId !== ws.data.user.id) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "delete",
                error: "You can only delete your own messages",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          const removed = deleteMessageById({
            messageId: event.messageId,
            authorId: ws.data.user.id,
          });

          if (!removed) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "delete",
                error: "Unable to delete the message",
                clientId: event.clientRequestId ?? undefined,
              })
            );
            return;
          }

          server.publish(
            channelTopic(removed.channelId),
            serializeEvent({
              type: "message_deleted",
              channelId: removed.channelId,
              messageId: removed.id,
              clientRequestId: event.clientRequestId ?? undefined,
            }),
          );
          break;
        }
        case "typing_start": {
          const channelId = event.channelId as Snowflake;
          const channel = getChannelById(channelId);
          if (!channel) {
            return;
          }

          if (!ws.data.joinedChannels.has(channelId)) {
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, channel.guildId)) {
            return;
          }

          ws.data.typingChannels.add(channelId);
          const expiresAt = new Date(Date.now() + TYPING_TIMEOUT_MS).toISOString();
          broadcastTypingStarted(channelId, ws.data.user.id, expiresAt);
          scheduleTypingTimeout(channelId, ws.data.user.id, () => {
            ws.data.typingChannels.delete(channelId);
          });
          break;
        }
        case "typing_stop": {
          const channelId = event.channelId as Snowflake;
          if (!ws.data.joinedChannels.has(channelId)) {
            return;
          }

          ws.data.typingChannels.delete(channelId);
          clearTypingState(channelId, ws.data.user.id, { notify: true });
          break;
        }
        case "emit_command": {
          ws.send(
            serializeEvent({
              type: "command_error",
              command: "help",
              error: "Command routing not implemented yet",
            })
          );
          break;
        }
        case "ack_history": {
          break;
        }
      }
    },
    close(ws: ServerWebSocket<WsContext>) {
      const { user, joinedChannels, typingChannels } = ws.data;
      for (const channelId of joinedChannels) {
        ws.unsubscribe(channelTopic(channelId));
      }
      joinedChannels.clear();
      for (const channelId of typingChannels) {
        clearTypingState(channelId, user.id, { notify: true });
      }
      typingChannels.clear();
      console.log(`${user.username} disconnected`);
    },
  },
});

function broadcastTypingStarted(
  channelId: Snowflake,
  userId: Snowflake,
  expiresAt: ISO8601Timestamp,
) {
  const event: GatewayServerEvent = {
    type: "typing_started",
    channelId,
    userId,
    expiresAt,
  };
  server.publish(channelTopic(channelId), serializeEvent(event));
}

function broadcastTypingStopped(channelId: Snowflake, userId: Snowflake) {
  const event: GatewayServerEvent = {
    type: "typing_stopped",
    channelId,
    userId,
  };
  server.publish(channelTopic(channelId), serializeEvent(event));
}

function scheduleTypingTimeout(
  channelId: Snowflake,
  userId: Snowflake,
  onExpire?: () => void,
) {
  const key = typingKey(channelId, userId);
  const existing = typingTimeouts.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    typingTimeouts.delete(key);
    if (onExpire) {
      onExpire();
    }
    broadcastTypingStopped(channelId, userId);
  }, TYPING_TIMEOUT_MS);

  typingTimeouts.set(key, timeout);
}

function clearTypingState(
  channelId: Snowflake,
  userId: Snowflake,
  options: { notify: boolean },
) {
  const key = typingKey(channelId, userId);
  const existing = typingTimeouts.get(key);
  if (existing) {
    clearTimeout(existing);
    typingTimeouts.delete(key);
    if (options.notify) {
      broadcastTypingStopped(channelId, userId);
    }
  }
}

console.log(`Server started. Listening on http://localhost:${server.port}`);
