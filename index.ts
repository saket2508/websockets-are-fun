import type { ServerWebSocket } from "bun";
import { z } from "zod";
import { runMigrations } from "./src/server/database";
import {
  appendMessage,
  createGuestSession,
  fetchChannelHistory,
  getChannelById,
  getSessionByToken,
  getUserById,
  listGuildBootstrap,
  userHasAccessToGuild,
  type Session,
} from "./src/server/repository";
import type {
  GatewayClientEvent,
  GatewayServerEvent,
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
  z.object({ type: z.literal("join_channel"), channelId: z.string(), limit: z.number().min(1).max(100).optional() }),
  z.object({ type: z.literal("leave_channel"), channelId: z.string() }),
  z.object({ type: z.literal("send_message"), channelId: z.string(), content: z.string().min(1), replyToId: z.string().nullable().optional() }),
  z.object({ type: z.literal("emit_command"), command: z.any() }),
  z.object({ type: z.literal("ack_history"), channelId: z.string(), messageIds: z.array(z.string()) }),
]);

type ClientEvent = z.infer<typeof clientEventSchema>;

type WsContext = {
  session: Session;
  user: User;
  joinedChannels: Set<Snowflake>;
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
    return result.success ? result.data : null;
  } catch (error) {
    console.error("Failed to parse client payload", error);
    return null;
  }
};

const serializeEvent = (event: GatewayServerEvent): string =>
  JSON.stringify(event);

const channelTopic = (channelId: Snowflake): string => `${CHANNEL_TOPIC_PREFIX}:${channelId}`;

const server = Bun.serve({
  port: 3000,
  fetch: async (req, serverInstance) => {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === GUEST_AUTH_ROUTE) {
      const body = await req.json().catch(() => ({}));
      const parsed = guestRequestSchema.safeParse(body);

      if (!parsed.success) {
        return toJsonResponse(400, { error: parsed.error.issues.map((issue) => issue.message).join(", ") });
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
        return toJsonResponse(403, { error: "You do not have access to this channel" });
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
          }),
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
            }),
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
              }),
            );
            return;
          }

          if (!userHasAccessToGuild(ws.data.user.id, channel.guildId)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "join",
                error: "You cannot join this channel",
              }),
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
            }),
          );
          break;
        }
        case "leave_channel": {
          const channelId = event.channelId as Snowflake;
          if (ws.data.joinedChannels.has(channelId)) {
            ws.data.joinedChannels.delete(channelId);
            ws.unsubscribe(channelTopic(channelId));
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
              }),
            );
            return;
          }

          if (!ws.data.joinedChannels.has(channel.id)) {
            ws.send(
              serializeEvent({
                type: "command_error",
                command: "history",
                error: "Join the channel before sending messages",
              }),
            );
            return;
          }

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
          };

          server.publish(channelTopic(channel.id), serializeEvent(payload));
          break;
        }
        case "emit_command": {
          ws.send(
            serializeEvent({
              type: "command_error",
              command: "help",
              error: "Command routing not implemented yet",
            }),
          );
          break;
        }
        case "ack_history": {
          break;
        }
      }
    },
    close(ws: ServerWebSocket<WsContext>) {
      const { user, joinedChannels } = ws.data;
      for (const channelId of joinedChannels) {
        ws.unsubscribe(channelTopic(channelId));
      }
      joinedChannels.clear();
      console.log(`${user.username} disconnected`);
    },
  },
});

console.log(`Server started. Listening on http://localhost:${server.port}`);
