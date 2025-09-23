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
  | OptimisticFailedAction;

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
  ui: {
    activeGuildId: null,
    activeChannelId: null,
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
        },
        guilds: {},
        channels: {},
        members: {},
        membersByGuild: {},
        messagesByChannel: {},
        optimisticMessages: {},
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
    case "command_error": {
      if (!event.clientId) {
        return null;
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
