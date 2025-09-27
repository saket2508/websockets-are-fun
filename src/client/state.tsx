import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
  Channel,
  GatewayServerEvent,
  Guild,
  HistoricalMessageBatch,
  Member,
  Message,
  Reaction,
  Snowflake,
  User,
  ISO8601Timestamp,
} from "../shared/types";

type ConnectionPhase = "idle" | "connecting" | "ready" | "reconnecting" | "closed";

type EnrichedMessage = Message & { author: User; reactions: Reaction[] };

type ChannelLog = {
  messages: EnrichedMessage[];
  fetchedAt: string | null;
  hasLoadedInitial: boolean;
};

type GuildBundle = {
  guild: Guild;
  channelIds: Snowflake[];
  memberIds: Snowflake[];
};

type ClientSession = {
  token: string;
  sessionId: Snowflake | null;
  user: User;
};

type OptimisticMessage = {
  clientId: string;
  channelId: Snowflake;
  content: string;
  createdAt: ISO8601Timestamp;
  status: "pending" | "error";
  error?: string;
};

type UiState = {
  activeGuildId: Snowflake | null;
  activeChannelId: Snowflake | null;
  commandError: string | null;
};

type OptimisticMutation =
  | {
      type: "edit";
      requestId: string;
      channelId: Snowflake;
      messageId: Snowflake;
      previousContent: string;
      previousUpdatedAt: ISO8601Timestamp;
    }
  | {
      type: "delete";
      requestId: string;
      channelId: Snowflake;
      messageId: Snowflake;
      snapshot: EnrichedMessage;
    };

export type ClientState = {
  connection: {
    phase: ConnectionPhase;
    lastError?: string;
  };
  session: ClientSession | null;
  guilds: Record<Snowflake, GuildBundle>;
  channels: Record<Snowflake, Channel>;
  members: Record<Snowflake, Member>;
  membersByGuild: Record<Snowflake, Snowflake[]>;
  messagesByChannel: Record<Snowflake, ChannelLog>;
  optimisticMessages: Record<string, OptimisticMessage>;
  optimisticMutations: Record<string, OptimisticMutation>;
  typingByChannel: Record<Snowflake, Record<Snowflake, ISO8601Timestamp>>;
  ui: UiState;
};

type SetConnectionPhaseAction = {
  type: "connection/setPhase";
  phase: ConnectionPhase;
  error?: string;
};

type SetSessionAction = {
  type: "session/set";
  session: ClientSession;
};

type ClearSessionAction = {
  type: "session/clear";
};

type SessionAckAction = {
  type: "session/ack";
  sessionId: Snowflake;
  user: User;
};

type IngestGuildBootstrapAction = {
  type: "guild/bootstrap";
  guild: Guild;
  channels: Channel[];
  members: Member[];
};

type SetActiveGuildAction = {
  type: "ui/setActiveGuild";
  guildId: Snowflake;
};

type SetActiveChannelAction = {
  type: "ui/setActiveChannel";
  channelId: Snowflake;
  guildId?: Snowflake;
};

type IngestHistoryBatchAction = {
  type: "channel/historyLoaded";
  batch: HistoricalMessageBatch;
};

type MessageReceivedAction = {
  type: "channel/messageReceived";
  payload: {
    message: Message;
    author: User;
    reactions: Reaction[];
    clientId?: string;
  };
};

type OptimisticQueuedAction = {
  type: "channel/optimisticQueued";
  payload: OptimisticMessage;
};

type OptimisticResolvedAction = {
  type: "channel/optimisticResolved";
  clientId: string;
  message: Message;
  author: User;
  reactions: Reaction[];
};

type OptimisticFailedAction = {
  type: "channel/optimisticFailed";
  clientId: string;
  error: string;
};

type ReactionOptimisticToggleAction = {
  type: "channel/reactionOptimisticToggled";
  payload: {
    channelId: Snowflake;
    messageId: Snowflake;
    emoji: string;
    userId: Snowflake;
  };
};

type ReactionsUpdatedAction = {
  type: "channel/reactionsUpdated";
  payload: {
    channelId: Snowflake;
    messageId: Snowflake;
    reactions: Reaction[];
  };
};

type TypingStartedAction = {
  type: "channel/typingStarted";
  payload: {
    channelId: Snowflake;
    userId: Snowflake;
    expiresAt: ISO8601Timestamp;
  };
};

type TypingStoppedAction = {
  type: "channel/typingStopped";
  payload: {
    channelId: Snowflake;
    userId: Snowflake;
  };
};

type MessageEditOptimisticAction = {
  type: "channel/messageEditOptimistic";
  payload: {
    channelId: Snowflake;
    messageId: Snowflake;
    nextContent: string;
    requestId: string;
    optimisticUpdatedAt: ISO8601Timestamp;
  };
};

type MessageDeleteOptimisticAction = {
  type: "channel/messageDeleteOptimistic";
  payload: {
    channelId: Snowflake;
    messageId: Snowflake;
    requestId: string;
  };
};

type MessageUpdatedAction = {
  type: "channel/messageUpdated";
  payload: {
    message: Message;
    clientRequestId?: string;
  };
};

type MessageDeletedAction = {
  type: "channel/messageDeleted";
  payload: {
    channelId: Snowflake;
    messageId: Snowflake;
    clientRequestId?: string;
  };
};

type MutationFailedAction = {
  type: "channel/mutationFailed";
  requestId: string;
  error: string;
};

type UiSetCommandErrorAction = {
  type: "ui/setCommandError";
  message: string | null;
};

type ClientAction =
  | SetConnectionPhaseAction
  | SetSessionAction
  | ClearSessionAction
  | SessionAckAction
  | IngestGuildBootstrapAction
  | SetActiveGuildAction
  | SetActiveChannelAction
  | IngestHistoryBatchAction
  | MessageReceivedAction
  | OptimisticQueuedAction
  | OptimisticResolvedAction
  | OptimisticFailedAction
  | ReactionOptimisticToggleAction
  | ReactionsUpdatedAction
  | MessageEditOptimisticAction
  | MessageDeleteOptimisticAction
  | MessageUpdatedAction
  | MessageDeletedAction
  | MutationFailedAction
  | UiSetCommandErrorAction
  | TypingStartedAction
  | TypingStoppedAction;

const initialChannelLog = (): ChannelLog => ({
  messages: [],
  fetchedAt: null,
  hasLoadedInitial: false,
});

const sortAscending = <T extends { createdAt: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

const upsertMessage = (log: ChannelLog, incoming: EnrichedMessage): ChannelLog => {
  const existingIndex = log.messages.findIndex((item) => item.id === incoming.id);
  if (existingIndex === -1) {
    return {
      ...log,
      messages: sortAscending([...log.messages, incoming]),
    };
  }

  const nextMessages = [...log.messages];
  nextMessages[existingIndex] = incoming;
  return {
    ...log,
    messages: sortAscending(nextMessages),
  };
};

const mergeHistory = (previous: ChannelLog, batch: HistoricalMessageBatch): ChannelLog => {
  if (batch.messages.length === 0) {
    return {
      ...previous,
      fetchedAt: batch.fetchedAt,
      hasLoadedInitial: true,
    };
  }

  const existingById = new Map(previous.messages.map((message) => [message.id, message] as const));
  for (const message of batch.messages) {
    existingById.set(message.id, message);
  }

  const merged = sortAscending(Array.from(existingById.values()));

  return {
    messages: merged,
    fetchedAt: batch.fetchedAt,
    hasLoadedInitial: true,
  };
};

const updateMessageInLog = (
  log: ChannelLog,
  messageId: Snowflake,
  updater: (message: EnrichedMessage) => EnrichedMessage,
): ChannelLog => {
  const index = log.messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return log;
  }

  const current = log.messages[index];
  if (!current) {
    return log;
  }

  const nextMessages = [...log.messages];
  nextMessages[index] = updater(current);
  return {
    ...log,
    messages: nextMessages,
  };
};

const toggleReactionForUser = ({
  reactions,
  emoji,
  userId,
  messageId,
}: {
  reactions: Reaction[];
  emoji: string;
  userId: Snowflake;
  messageId: Snowflake;
}): Reaction[] => {
  const existingIndex = reactions.findIndex(
    (reaction) => reaction.emoji === emoji && reaction.authorId === userId,
  );

  if (existingIndex !== -1) {
    const next = [...reactions];
    next.splice(existingIndex, 1);
    return next;
  }

  return [
    ...reactions,
    {
      messageId,
      emoji,
      authorId: userId,
      createdAt: new Date().toISOString(),
    },
  ];
};

const pruneTypingEntries = (
  entries: Record<Snowflake, ISO8601Timestamp>,
): Record<Snowflake, ISO8601Timestamp> => {
  const now = Date.now();
  const next: Record<Snowflake, ISO8601Timestamp> = {};
  for (const [userId, expiresAt] of Object.entries(entries)) {
    if (new Date(expiresAt).getTime() > now) {
      next[userId as Snowflake] = expiresAt;
    }
  }
  return next;
};

const firstAvailableTextChannel = (channels: Channel[]): Channel | null => {
  const textChannels = channels.filter((channel) => channel.type === "text");
  if (textChannels.length > 0) {
    return textChannels.sort((a, b) => a.position - b.position)[0] ?? null;
  }
  return channels.length > 0 ? channels[0]! : null;
};

export const initialState: ClientState = {
  connection: {
    phase: "idle",
  },
  session: null,
  guilds: {},
  channels: {},
  members: {},
  membersByGuild: {},
  messagesByChannel: {},
  optimisticMessages: {},
  optimisticMutations: {},
  typingByChannel: {},
  ui: {
    activeGuildId: null,
    activeChannelId: null,
    commandError: null,
  },
};

export const clientReducer = (
  state: ClientState,
  action: ClientAction
): ClientState => {
  switch (action.type) {
    case "connection/setPhase": {
      return {
        ...state,
        connection: {
          phase: action.phase,
          lastError: action.error,
        },
      };
    }
    case "session/set": {
      return {
        ...state,
        session: action.session,
      };
    }
    case "session/ack": {
      if (!state.session) {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          sessionId: action.sessionId,
          user: action.user,
        },
      };
    }
    case "session/clear": {
      return {
        ...state,
        session: null,
        ui: {
          activeGuildId: null,
          activeChannelId: null,
          commandError: null,
        },
        guilds: {},
        channels: {},
        members: {},
        membersByGuild: {},
        messagesByChannel: {},
        optimisticMessages: {},
        optimisticMutations: {},
        typingByChannel: {},
      };
    }
    case "guild/bootstrap": {
      const guild = action.guild;
      const channelsById = { ...state.channels };
      const membersById = { ...state.members };

      for (const channel of action.channels) {
        channelsById[channel.id] = channel;
      }

      for (const member of action.members) {
        membersById[member.userId] = member;
      }

      const nextGuilds = {
        ...state.guilds,
        [guild.id]: {
          guild,
          channelIds: action.channels.map((channel) => channel.id),
          memberIds: action.members.map((member) => member.userId),
        },
      } satisfies Record<Snowflake, GuildBundle>;

      const nextMembersByGuild = {
        ...state.membersByGuild,
        [guild.id]: action.members.map((member) => member.userId),
      };

      const nextUi = { ...state.ui };
      if (!state.ui.activeGuildId) {
        nextUi.activeGuildId = guild.id;
      }

      if (!state.ui.activeChannelId) {
        const preferred = firstAvailableTextChannel(action.channels);
        nextUi.activeChannelId = preferred?.id ?? null;
      }

      return {
        ...state,
        guilds: nextGuilds,
        channels: channelsById,
        members: membersById,
        membersByGuild: nextMembersByGuild,
        ui: nextUi,
      };
    }
    case "ui/setActiveGuild": {
      const guild = state.guilds[action.guildId];
      const fallbackChannelId = guild ? guild.channelIds[0] ?? null : null;
      return {
        ...state,
        ui: {
          ...state.ui,
          activeGuildId: action.guildId,
          activeChannelId: fallbackChannelId,
        },
      };
    }
    case "ui/setActiveChannel": {
      const nextGuildId = action.guildId ?? state.ui.activeGuildId;
      return {
        ...state,
        ui: {
          ...state.ui,
          activeGuildId: nextGuildId,
          activeChannelId: action.channelId,
        },
      };
    }
    case "ui/setCommandError": {
      return {
        ...state,
        ui: {
          ...state.ui,
          commandError: action.message,
        },
      };
    }
    case "channel/historyLoaded": {
      const existingLog = state.messagesByChannel[action.batch.channelId] ?? initialChannelLog();
      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.batch.channelId]: mergeHistory(existingLog, action.batch),
        },
      };
    }
    case "channel/messageReceived": {
      const log = state.messagesByChannel[action.payload.message.channelId] ?? initialChannelLog();
      const merged = upsertMessage(log, {
        ...action.payload.message,
        author: action.payload.author,
        reactions: action.payload.reactions,
      });

      const nextOptimistic = { ...state.optimisticMessages };
      if (action.payload.clientId && nextOptimistic[action.payload.clientId]) {
        delete nextOptimistic[action.payload.clientId];
      } else {
        for (const [optimisticId, optimistic] of Object.entries(nextOptimistic)) {
          if (
            optimistic.channelId === action.payload.message.channelId &&
            optimistic.content === action.payload.message.content
          ) {
            delete nextOptimistic[optimisticId];
          }
        }
      }

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.payload.message.channelId]: merged,
        },
        optimisticMessages: nextOptimistic,
      };
    }
    case "channel/optimisticQueued": {
      return {
        ...state,
        optimisticMessages: {
          ...state.optimisticMessages,
          [action.payload.clientId]: action.payload,
        },
      };
    }
    case "channel/optimisticResolved": {
      const log = state.messagesByChannel[action.message.channelId] ?? initialChannelLog();
      const merged = upsertMessage(log, {
        ...action.message,
        author: action.author,
        reactions: action.reactions,
      });

      const nextOptimistic = { ...state.optimisticMessages };
      delete nextOptimistic[action.clientId];

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.message.channelId]: merged,
        },
        optimisticMessages: nextOptimistic,
      };
    }
    case "channel/optimisticFailed": {
      const optimistic = state.optimisticMessages[action.clientId];
      if (!optimistic) {
        return state;
      }

      return {
        ...state,
        optimisticMessages: {
          ...state.optimisticMessages,
          [action.clientId]: {
            ...optimistic,
            status: "error",
            error: action.error,
          },
        },
      };
    }
    case "channel/messageEditOptimistic": {
      const log = state.messagesByChannel[action.payload.channelId];
      if (!log) {
        return state;
      }

      const existing = log.messages.find((message) => message.id === action.payload.messageId);
      if (!existing) {
        return state;
      }

      const updatedLog = updateMessageInLog(log, action.payload.messageId, (message) => ({
        ...message,
        content: action.payload.nextContent,
        updatedAt: action.payload.optimisticUpdatedAt,
      }));

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.payload.channelId]: updatedLog,
        },
        optimisticMutations: {
          ...state.optimisticMutations,
          [action.payload.requestId]: {
            type: "edit",
            requestId: action.payload.requestId,
            channelId: action.payload.channelId,
            messageId: action.payload.messageId,
            previousContent: existing.content,
            previousUpdatedAt: existing.updatedAt,
          },
        },
      };
    }
    case "channel/messageDeleteOptimistic": {
      const log = state.messagesByChannel[action.payload.channelId];
      if (!log) {
        return state;
      }

      const existingIndex = log.messages.findIndex((message) => message.id === action.payload.messageId);
      if (existingIndex === -1) {
        return state;
      }

      const snapshot = log.messages[existingIndex]!;
      const nextMessages = [...log.messages.slice(0, existingIndex), ...log.messages.slice(existingIndex + 1)];

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.payload.channelId]: {
            ...log,
            messages: nextMessages,
          },
        },
        optimisticMutations: {
          ...state.optimisticMutations,
          [action.payload.requestId]: {
            type: "delete",
            requestId: action.payload.requestId,
            channelId: action.payload.channelId,
            messageId: action.payload.messageId,
            snapshot,
          },
        },
      };
    }
    case "channel/messageUpdated": {
      const { message, clientRequestId } = action.payload;
      const log = state.messagesByChannel[message.channelId];
      if (!log) {
        return state;
      }

      const updatedLog = updateMessageInLog(log, message.id, (current) => ({
        ...current,
        content: message.content,
        updatedAt: message.updatedAt,
      }));

      const nextMutations = { ...state.optimisticMutations };
      if (clientRequestId && nextMutations[clientRequestId]) {
        delete nextMutations[clientRequestId];
      } else {
        for (const [id, mutation] of Object.entries(nextMutations)) {
          if (mutation.type === "edit" && mutation.messageId === message.id) {
            delete nextMutations[id];
          }
        }
      }

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [message.channelId]: updatedLog,
        },
        optimisticMutations: nextMutations,
        ui: {
          ...state.ui,
          commandError: null,
        },
      };
    }
    case "channel/messageDeleted": {
      const { channelId, messageId, clientRequestId } = action.payload;
      const log = state.messagesByChannel[channelId];
      if (!log) {
        return state;
      }

      const nextMessages = log.messages.filter((message) => message.id !== messageId);
      const nextMutations = { ...state.optimisticMutations };
      if (clientRequestId && nextMutations[clientRequestId]) {
        delete nextMutations[clientRequestId];
      } else {
        for (const [id, mutation] of Object.entries(nextMutations)) {
          if (mutation.type === "delete" && mutation.messageId === messageId) {
            delete nextMutations[id];
          }
        }
      }

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: {
            ...log,
            messages: nextMessages,
          },
        },
        optimisticMutations: nextMutations,
        ui: {
          ...state.ui,
          commandError: null,
        },
      };
    }
    case "channel/mutationFailed": {
      const mutation = state.optimisticMutations[action.requestId];
      const nextMutations = { ...state.optimisticMutations };
      if (mutation) {
        delete nextMutations[action.requestId];
      }

      if (!mutation) {
        return {
          ...state,
          optimisticMutations: nextMutations,
          ui: {
            ...state.ui,
            commandError: action.error,
          },
        };
      }

      if (mutation.type === "edit") {
        const log = state.messagesByChannel[mutation.channelId];
        if (!log) {
          return {
            ...state,
            optimisticMutations: nextMutations,
            ui: {
              ...state.ui,
              commandError: action.error,
            },
          };
        }

        const restoredLog = updateMessageInLog(log, mutation.messageId, (message) => ({
          ...message,
          content: mutation.previousContent,
          updatedAt: mutation.previousUpdatedAt,
        }));

        return {
          ...state,
          messagesByChannel: {
            ...state.messagesByChannel,
            [mutation.channelId]: restoredLog,
          },
          optimisticMutations: nextMutations,
          ui: {
            ...state.ui,
            commandError: action.error,
          },
        };
      }

      const log = state.messagesByChannel[mutation.channelId];
      const restoredLog = log ? upsertMessage(log, mutation.snapshot) : initialChannelLog();

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [mutation.channelId]: restoredLog,
        },
        optimisticMutations: nextMutations,
        ui: {
          ...state.ui,
          commandError: action.error,
        },
      };
    }
    case "channel/reactionOptimisticToggled": {
      const log = state.messagesByChannel[action.payload.channelId] ?? initialChannelLog();
      const updatedLog = updateMessageInLog(log, action.payload.messageId, (message) => ({
        ...message,
        reactions: toggleReactionForUser({
          reactions: message.reactions,
          emoji: action.payload.emoji,
          userId: action.payload.userId,
          messageId: message.id,
        }),
      }));

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.payload.channelId]: updatedLog,
        },
      };
    }
    case "channel/reactionsUpdated": {
      const log = state.messagesByChannel[action.payload.channelId] ?? initialChannelLog();
      const updatedLog = updateMessageInLog(log, action.payload.messageId, (message) => ({
        ...message,
        reactions: action.payload.reactions,
      }));

      return {
        ...state,
        messagesByChannel: {
          ...state.messagesByChannel,
          [action.payload.channelId]: updatedLog,
        },
      };
    }
    case "channel/typingStarted": {
      const existing = state.typingByChannel[action.payload.channelId] ?? {};
      const trimmed = pruneTypingEntries(existing);
      trimmed[action.payload.userId] = action.payload.expiresAt;

      return {
        ...state,
        typingByChannel: {
          ...state.typingByChannel,
          [action.payload.channelId]: trimmed,
        },
      };
    }
    case "channel/typingStopped": {
      const existing = state.typingByChannel[action.payload.channelId];
      if (!existing) {
        return state;
      }

      const trimmed = pruneTypingEntries(existing);
      delete trimmed[action.payload.userId];

      const nextTyping = { ...state.typingByChannel };
      if (Object.keys(trimmed).length === 0) {
        delete nextTyping[action.payload.channelId];
      } else {
        nextTyping[action.payload.channelId] = trimmed;
      }

      return {
        ...state,
        typingByChannel: nextTyping,
      };
    }
    default:
      return state;
  }
};

const ClientStateContext = createContext<ClientState>(initialState);
const ClientDispatchContext = createContext<React.Dispatch<ClientAction>>(() => {
  throw new Error("ClientDispatchContext accessed outside of provider");
});

type ClientStateProviderProps = {
  children: React.ReactNode;
};

export function ClientStateProvider({ children }: ClientStateProviderProps) {
  const [state, dispatch] = useReducer(clientReducer, initialState);
  const memoisedState = useMemo(() => state, [state]);
  return (
    <ClientStateContext.Provider value={memoisedState}>
      <ClientDispatchContext.Provider value={dispatch}>{children}</ClientDispatchContext.Provider>
    </ClientStateContext.Provider>
  );
}

export const useClientState = () => useContext(ClientStateContext);
export const useClientDispatch = () => useContext(ClientDispatchContext);

export const reduceGatewayEvent = (
  event: GatewayServerEvent,
): ClientAction | ClientAction[] | null => {
  switch (event.type) {
    case "connection_ack": {
      return {
        type: "session/ack",
        sessionId: event.sessionId,
        user: event.user,
      } satisfies SessionAckAction;
    }
    case "guild_bootstrap": {
      return {
        type: "guild/bootstrap",
        guild: event.guild,
        channels: event.channels,
        members: event.members,
      } satisfies IngestGuildBootstrapAction;
    }
    case "history_batch": {
      return {
        type: "channel/historyLoaded",
        batch: event.batch,
      } satisfies IngestHistoryBatchAction;
    }
    case "message_created": {
      return {
        type: "channel/messageReceived",
        payload: {
          message: event.message,
          author: event.author,
          reactions: event.reactions,
          clientId: event.clientId,
        },
      } satisfies MessageReceivedAction;
    }
    case "reactions_updated": {
      return {
        type: "channel/reactionsUpdated",
        payload: {
          channelId: event.channelId,
          messageId: event.messageId,
          reactions: event.reactions,
        },
      } satisfies ReactionsUpdatedAction;
    }
    case "message_updated": {
      return {
        type: "channel/messageUpdated",
        payload: {
          message: event.message,
          clientRequestId: event.clientRequestId,
        },
      } satisfies MessageUpdatedAction;
    }
    case "message_deleted": {
      return {
        type: "channel/messageDeleted",
        payload: {
          channelId: event.channelId,
          messageId: event.messageId,
          clientRequestId: event.clientRequestId,
        },
      } satisfies MessageDeletedAction;
    }
    case "typing_started": {
      return {
        type: "channel/typingStarted",
        payload: {
          channelId: event.channelId,
          userId: event.userId,
          expiresAt: event.expiresAt,
        },
      } satisfies TypingStartedAction;
    }
    case "typing_stopped": {
      return {
        type: "channel/typingStopped",
        payload: {
          channelId: event.channelId,
          userId: event.userId,
        },
      } satisfies TypingStoppedAction;
    }
    case "command_error": {
      if (!event.clientId) {
        return {
          type: "ui/setCommandError",
          message: event.error,
        } satisfies UiSetCommandErrorAction;
      }

      if (event.command === "edit" || event.command === "delete") {
        return [
          {
            type: "channel/mutationFailed",
            requestId: event.clientId,
            error: event.error,
          } satisfies MutationFailedAction,
          {
            type: "ui/setCommandError",
            message: event.error,
          } satisfies UiSetCommandErrorAction,
        ];
      }

      return {
        type: "channel/optimisticFailed",
        clientId: event.clientId,
        error: event.error,
      } satisfies OptimisticFailedAction;
    }
    default:
      return null;
  }
};

export type { ClientAction, ClientSession, ConnectionPhase, EnrichedMessage, GuildBundle, OptimisticMessage };
