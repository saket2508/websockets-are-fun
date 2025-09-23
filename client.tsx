import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, render, useInput } from "ink";
import kleur from "kleur";
import { customAlphabet } from "nanoid";
import {
  ClientStateProvider,
  useClientDispatch,
  useClientState,
  type ConnectionPhase,
  type EnrichedMessage,
} from "./src/client/state";
import { GatewayClient } from "./src/client/gateway";
import { Composer } from "./src/client/components/Composer";
import { GuildRail } from "./src/client/components/GuildRail";
import { ChannelList } from "./src/client/components/ChannelList";
import { MemberList } from "./src/client/components/MemberList";
import { MessagePane } from "./src/client/components/MessagePane";
import type { Channel, Guild, Snowflake, User } from "./src/shared/types";

const API_BASE_URL = "http://localhost:3000";
const GUEST_AUTH_ENDPOINT = `${API_BASE_URL}/api/auth/guest`;

const statusColour = (status: ConnectionPhase): string => {
  switch (status) {
    case "ready":
      return kleur.green(status);
    case "connecting":
      return kleur.yellow(status);
    case "reconnecting":
      return kleur.magenta(status);
    case "closed":
      return kleur.red(status);
    default:
      return kleur.gray(status);
  }
};

type GuestSession = {
  id: Snowflake;
  token: string;
  userId: Snowflake;
  createdAt: string;
  expiresAt: string;
};

type GuestAuthResponse = {
  user: User;
  session: GuestSession;
};

type FocusTarget = "guilds" | "channels" | "messages" | "members" | "composer";
const focusOrder: FocusTarget[] = [
  "guilds",
  "channels",
  "messages",
  "members",
  "composer",
];
const makeOptimisticId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  12
);
const VISIBLE_MESSAGE_COUNT = 20;

const fetchGuestSession = async (): Promise<GuestAuthResponse> => {
  const response = await fetch(GUEST_AUTH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Guest auth failed (${response.status}): ${body}`);
  }

  return (await response.json()) as GuestAuthResponse;
};

const useGateway = () => {
  const dispatch = useClientDispatch();
  const gatewayRef = useRef<GatewayClient | null>(null);

  if (!gatewayRef.current) {
    gatewayRef.current = new GatewayClient({ dispatch });
  }

  useEffect(() => {
    const gateway = gatewayRef.current;
    return () => {
      gateway?.stop();
    };
  }, []);

  return gatewayRef;
};

const cycleGuild = (
  guilds: Guild[],
  currentId: Snowflake | null,
  direction: 1 | -1
): Snowflake | null => {
  if (guilds.length === 0) {
    return null;
  }

  const index = guilds.findIndex((entry) => entry.id === currentId);
  if (index === -1) {
    return guilds[0]?.id ?? null;
  }

  const nextIndex = (index + direction + guilds.length) % guilds.length;
  return guilds[nextIndex]?.id ?? null;
};

const cycleChannel = (
  channels: Channel[],
  currentId: Snowflake | null,
  direction: 1 | -1
): Snowflake | null => {
  if (channels.length === 0) {
    return null;
  }

  const index = channels.findIndex((channel) => channel.id === currentId);
  const nextIndex =
    index === -1 ? 0 : (index + direction + channels.length) % channels.length;
  return channels[nextIndex]?.id ?? null;
};

const useClientBootstrap = (
  gatewayRef: React.MutableRefObject<GatewayClient | null>,
  setAuthError: (value: string | null) => void
) => {
  const dispatch = useClientDispatch();
  const state = useClientState();
  const joinedChannels = useRef<Set<Snowflake>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (state.session) {
      return undefined;
    }

    (async () => {
      try {
        const result = await fetchGuestSession();
        if (cancelled) {
          return;
        }

        dispatch({
          type: "session/set",
          session: {
            token: result.session.token,
            sessionId: result.session.id,
            user: result.user,
          },
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Unknown guest auth error";
        setAuthError(message);
        dispatch({
          type: "connection/setPhase",
          phase: "closed",
          error: message,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, setAuthError, state.session]);

  useEffect(() => {
    const token = state.session?.token;
    const gateway = gatewayRef.current;
    if (!token || !gateway) {
      return undefined;
    }

    joinedChannels.current.clear();
    gateway.start(token);

    return () => {
      gateway.stop();
      joinedChannels.current.clear();
    };
  }, [gatewayRef, state.session?.token]);

  useEffect(() => {
    if (state.connection.phase !== "ready") {
      return;
    }

    const activeChannelId = state.ui.activeChannelId;
    const gateway = gatewayRef.current;
    if (!activeChannelId || !gateway) {
      return;
    }

    if (joinedChannels.current.has(activeChannelId)) {
      return;
    }

    gateway.joinChannel(activeChannelId, 50);
    joinedChannels.current.add(activeChannelId);
  }, [gatewayRef, state.connection.phase, state.ui.activeChannelId]);
};

const moveFocusFrom = (origin: FocusTarget, delta: number): FocusTarget => {
  const currentIndex = focusOrder.indexOf(origin);
  if (currentIndex === -1) {
    return focusOrder[0] ?? origin;
  }
  const nextIndex =
    (currentIndex + delta + focusOrder.length) % focusOrder.length;
  return focusOrder[nextIndex] ?? origin;
};

const MessageLayout = () => {
  const state = useClientState();
  const dispatch = useClientDispatch();
  const gatewayRef = useGateway();
  const [composerValue, setComposerValue] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentFocus, setCurrentFocus] = useState<FocusTarget>("channels");
  const [messageOffset, setMessageOffset] = useState<number>(0);
  const acknowledgedHistory = useRef<Map<string, string>>(new Map());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);

  useClientBootstrap(gatewayRef, setAuthError);

  const guildList = useMemo(
    () => Object.values(state.guilds).map((bundle) => bundle.guild),
    [state.guilds]
  );
  const activeGuild = state.ui.activeGuildId
    ? state.guilds[state.ui.activeGuildId] ?? null
    : null;
  const channelList = useMemo(() => {
    if (!activeGuild) {
      return [] as Channel[];
    }
    return activeGuild.channelIds
      .map((channelId) => state.channels[channelId])
      .filter((channel): channel is Channel => Boolean(channel));
  }, [activeGuild, state.channels]);

  const memberIds = activeGuild?.memberIds ?? [];
  const messageLog = state.ui.activeChannelId
    ? state.messagesByChannel[state.ui.activeChannelId] ?? null
    : null;
  const currentUser = state.session?.user;
  const optimisticForChannel = useMemo(
    () =>
      state.ui.activeChannelId
        ? Object.values(state.optimisticMessages)
            .filter((entry) => entry.channelId === state.ui.activeChannelId)
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
            )
            .map((entry) => ({
              clientId: entry.clientId,
              content: entry.content,
              createdAt: entry.createdAt,
              status: entry.status,
              error: entry.error,
              authorName:
                currentUser?.displayName ?? currentUser?.username ?? "You",
            }))
        : [],
    [
      currentUser?.displayName,
      currentUser?.username,
      state.optimisticMessages,
      state.ui.activeChannelId,
    ]
  );

  useEffect(() => {
    setMessageOffset(0);
  }, [state.ui.activeChannelId]);

  useEffect(() => {
    if (
      !state.ui.activeChannelId ||
      !messageLog ||
      !messageLog.hasLoadedInitial ||
      !messageLog.fetchedAt
    ) {
      return;
    }

    const key = state.ui.activeChannelId;
    if (acknowledgedHistory.current.get(key) === messageLog.fetchedAt) {
      return;
    }

    const gateway = gatewayRef.current;
    if (gateway && messageLog.messages.length > 0) {
      gateway.acknowledgeHistory(
        key,
        messageLog.messages.map((message) => message.id)
      );
    }

    acknowledgedHistory.current.set(key, messageLog.fetchedAt);
  }, [
    gatewayRef,
    messageLog?.fetchedAt,
    messageLog?.hasLoadedInitial,
    state.ui.activeChannelId,
  ]);

  const persistedMessages: EnrichedMessage[] = messageLog?.messages ?? [];
  const totalMessages = persistedMessages.length;
  const maxOffset = Math.max(0, totalMessages - VISIBLE_MESSAGE_COUNT);

  useEffect(() => {
    setMessageOffset((prev) => Math.min(prev, maxOffset));
  }, [maxOffset]);

  const boundedOffset = Math.min(messageOffset, maxOffset);
  const endIndex = Math.max(0, totalMessages - boundedOffset);
  const startIndex = Math.max(0, endIndex - VISIBLE_MESSAGE_COUNT);
  const visibleMessages = persistedMessages.slice(startIndex, endIndex);
  const hasOlder = startIndex > 0;
  const hasNewer = endIndex < totalMessages;
  const optimisticForRender = hasNewer ? [] : optimisticForChannel;

  const handleGuildCycle = (direction: 1 | -1) => {
    const nextGuildId = cycleGuild(
      guildList,
      state.ui.activeGuildId,
      direction
    );
    if (nextGuildId) {
      dispatch({ type: "ui/setActiveGuild", guildId: nextGuildId });
    }
  };

  const handleChannelCycle = (direction: 1 | -1) => {
    const nextChannelId = cycleChannel(
      channelList,
      state.ui.activeChannelId,
      direction
    );
    if (nextChannelId) {
      dispatch({
        type: "ui/setActiveChannel",
        channelId: nextChannelId,
        guildId: activeGuild?.guild.id,
      });
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      gatewayRef.current?.stop();
      process.exit(0);
      return;
    }

    if (key.ctrl && input.toLowerCase() === "p") {
      setCommandPaletteOpen((prev) => !prev);
      return;
    }

    if (commandPaletteOpen) {
      if (key.escape || key.return) {
        setCommandPaletteOpen(false);
      }
      return;
    }

    if (key.tab) {
      setCurrentFocus((prev) => moveFocusFrom(prev, key.shift ? -1 : 1));
      return;
    }

    if (key.leftArrow) {
      setCurrentFocus((prev) => moveFocusFrom(prev, -1));
      return;
    }

    if (key.rightArrow) {
      setCurrentFocus((prev) => moveFocusFrom(prev, 1));
      return;
    }

    if (currentFocus === "guilds" && (key.upArrow || key.downArrow)) {
      handleGuildCycle(key.upArrow ? -1 : 1);
      return;
    }

    if (currentFocus === "channels" && (key.upArrow || key.downArrow)) {
      handleChannelCycle(key.upArrow ? -1 : 1);
      return;
    }

    if (currentFocus === "messages" && (key.upArrow || key.downArrow)) {
      if (key.upArrow) {
        setMessageOffset((prev) => Math.min(prev + 1, maxOffset));
      } else {
        setMessageOffset((prev) => Math.max(prev - 1, 0));
      }
      return;
    }

    if (currentFocus === "composer") {
      if (key.return) {
        const trimmed = composerValue.trim();
        const channelId = state.ui.activeChannelId;
        if (!trimmed || !channelId) {
          return;
        }
        const clientId = makeOptimisticId();
        const createdAt = new Date().toISOString();
        setMessageOffset(0);
        dispatch({
          type: "channel/optimisticQueued",
          payload: {
            clientId,
            channelId,
            content: trimmed,
            createdAt,
            status: "pending",
          },
        });
        gatewayRef.current?.sendChatMessage({
          channelId,
          content: trimmed,
          clientId,
        });
        setComposerValue("");
        return;
      }

      if (key.backspace || key.delete) {
        setComposerValue((prev) => prev.slice(0, -1));
        return;
      }

      if (input.length === 1 && !key.ctrl && !key.meta) {
        setComposerValue((prev) => prev + input);
      }
      return;
    }

    if (key.return) {
      setCurrentFocus("composer");
    }
  });

  const channelName = state.ui.activeChannelId
    ? state.channels[state.ui.activeChannelId]?.name ?? null
    : null;
  const hasLoaded = messageLog?.hasLoadedInitial ?? false;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text>
          Status: {statusColour(state.connection.phase)}
          {state.connection.lastError
            ? kleur.red(` (${state.connection.lastError})`)
            : ""}
        </Text>
        <Text color="gray">
          TAB to cycle panes · ENTER to focus composer · CTRL+C to quit · ↑/↓ to
          scroll · CTRL+P for command palette
        </Text>
      </Box>
      {commandPaletteOpen ? (
        <Box
          marginBottom={1}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Text color="cyan">
            Command palette coming soon… (ESC to dismiss)
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="row" gap={1}>
        <GuildRail
          guilds={guildList}
          activeGuildId={state.ui.activeGuildId}
          focus={currentFocus === "guilds"}
        />
        <ChannelList
          channels={channelList}
          activeChannelId={state.ui.activeChannelId}
          focus={currentFocus === "channels"}
        />
        <MessagePane
          channelName={channelName}
          messages={visibleMessages}
          optimisticMessages={optimisticForRender}
          hasLoaded={hasLoaded}
          focus={currentFocus === "messages"}
          authError={authError}
          hasOlder={hasOlder}
          hasNewer={hasNewer}
        />
        <MemberList
          members={state.members}
          memberIds={memberIds}
          focus={currentFocus === "members"}
        />
      </Box>
      <Box marginTop={1}>
        <Composer value={composerValue} focus={currentFocus === "composer"} />
      </Box>
    </Box>
  );
};

const RootView = (): ReactElement => <MessageLayout />;

const App = (): ReactElement => (
  <ClientStateProvider>
    <RootView />
  </ClientStateProvider>
);

render(<App />);
