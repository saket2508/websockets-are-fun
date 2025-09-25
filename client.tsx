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

type ComposerMode =
  | null
  | {
      type: "edit";
      messageId: Snowflake;
      channelId: Snowflake;
      originalContent: string;
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
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentFocus, setCurrentFocus] = useState<FocusTarget>("channels");
  const [messageOffset, setMessageOffset] = useState<number>(0);
  const acknowledgedHistory = useRef<Map<string, string>>(new Map());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [selectedMessageId, setSelectedMessageId] = useState<Snowflake | null>(null);
  const commandError = state.ui.commandError;

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
  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) {
      return null;
    }
    return persistedMessages.find((message) => message.id === selectedMessageId) ?? null;
  }, [persistedMessages, selectedMessageId]);

  useEffect(() => {
    if (state.ui.activeChannelId) {
      const latest = persistedMessages[persistedMessages.length - 1];
      setSelectedMessageId(latest?.id ?? null);
    } else {
      setSelectedMessageId(null);
    }
    setMessageOffset(0);
    setComposerMode(null);
    setComposerValue("");
    dispatch({ type: "ui/setCommandError", message: null });
  }, [dispatch, state.ui.activeChannelId]);

  useEffect(() => {
    const latestVisible = visibleMessages[visibleMessages.length - 1];
    if (latestVisible) {
      setSelectedMessageId(latestVisible.id);
    }
  }, [visibleMessages]);

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

  const handleReactCommand = (input: string): boolean => {
    if (!input.startsWith("/react")) {
      return false;
    }

    if (!state.session) {
      dispatch({ type: "ui/setCommandError", message: "Sign in before reacting." });
      return true;
    }

    const channelId = state.ui.activeChannelId;
    if (!channelId) {
      dispatch({ type: "ui/setCommandError", message: "Select a channel before reacting." });
      return true;
    }

    const args = input.slice("/react".length).trim();
    if (!args) {
      dispatch({ type: "ui/setCommandError", message: "Usage: /react <emoji> [messageId]" });
      return true;
    }

    const parts = args.split(/\s+/);
    let emojiPart = "";
    let messageId: Snowflake | null = null;

    if (parts.length > 1) {
      messageId = parts[0] as Snowflake;
      emojiPart = parts.slice(1).join(" ");
    } else {
      emojiPart = parts[0] ?? "";
    }

    const emoji = emojiPart.trim();
    if (!emoji) {
      dispatch({ type: "ui/setCommandError", message: "Provide an emoji to react with." });
      return true;
    }

    let targetMessageId = messageId;
    const channelLog = state.messagesByChannel[channelId];
    if (!targetMessageId) {
      if (selectedMessage) {
        targetMessageId = selectedMessage.id;
      } else {
        const latestMessage = channelLog?.messages[channelLog.messages.length - 1];
        if (!latestMessage) {
          dispatch({ type: "ui/setCommandError", message: "No messages available to react to yet." });
          return true;
        }
        targetMessageId = latestMessage.id;
      }
    } else {
      const exists = channelLog?.messages.some((message) => message.id === targetMessageId);
      if (!exists) {
        dispatch({ type: "ui/setCommandError", message: "Message not found in this channel." });
        return true;
      }
    }

    dispatch({
      type: "channel/reactionOptimisticToggled",
      payload: {
        channelId,
        messageId: targetMessageId,
        emoji,
        userId: state.session.user.id,
      },
    });
    gatewayRef.current?.toggleReaction(targetMessageId, emoji);
    dispatch({ type: "ui/setCommandError", message: null });
    setComposerValue("");
    return true;
  };

  const resolveMessageTarget = (
    channelId: Snowflake,
    explicitId: Snowflake | null,
  ): EnrichedMessage | null => {
    const channelLog = state.messagesByChannel[channelId];
    if (!channelLog || channelLog.messages.length === 0) {
      return null;
    }

    if (explicitId) {
      return channelLog.messages.find((message) => message.id === explicitId) ?? null;
    }

    if (selectedMessage) {
      return selectedMessage;
    }

    return channelLog.messages[channelLog.messages.length - 1] ?? null;
  };

  const enterEditMode = (message: EnrichedMessage) => {
    setComposerMode({
      type: "edit",
      messageId: message.id,
      channelId: message.channelId,
      originalContent: message.content,
    });
    setComposerValue(message.content);
    dispatch({ type: "ui/setCommandError", message: null });
    setCurrentFocus("composer");
  };

  const dispatchEditMutation = (message: EnrichedMessage, nextContent: string) => {
    const requestId = makeOptimisticId();
    const optimisticUpdatedAt = new Date().toISOString();

    dispatch({
      type: "channel/messageEditOptimistic",
      payload: {
        channelId: message.channelId,
        messageId: message.id,
        nextContent,
        requestId,
        optimisticUpdatedAt,
      },
    });

    gatewayRef.current?.editMessage({
      messageId: message.id,
      content: nextContent,
      clientRequestId: requestId,
    });

    setComposerMode(null);
    setComposerValue("");
    dispatch({ type: "ui/setCommandError", message: null });
  };

  const dispatchDeleteMutation = (message: EnrichedMessage) => {
    const requestId = makeOptimisticId();

    dispatch({
      type: "channel/messageDeleteOptimistic",
      payload: {
        channelId: message.channelId,
        messageId: message.id,
        requestId,
      },
    });

    gatewayRef.current?.deleteMessage({
      messageId: message.id,
      clientRequestId: requestId,
    });

    if (composerMode?.type === "edit" && composerMode.messageId === message.id) {
      setComposerMode(null);
      setComposerValue("");
    }

    dispatch({ type: "ui/setCommandError", message: null });
  };

  const handleEditCommand = (input: string): boolean => {
    if (!input.startsWith("/edit")) {
      return false;
    }

    if (!state.session) {
      dispatch({ type: "ui/setCommandError", message: "Sign in before editing." });
      return true;
    }

    const channelId = state.ui.activeChannelId;
    if (!channelId) {
      dispatch({ type: "ui/setCommandError", message: "Select a channel before editing." });
      return true;
    }

    const channelLog = state.messagesByChannel[channelId];
    if (!channelLog || channelLog.messages.length === 0) {
      dispatch({ type: "ui/setCommandError", message: "No messages available to edit." });
      return true;
    }

    const args = input.slice("/edit".length).trim();
    const parts = args.length > 0 ? args.split(/\s+/) : [];
    let targetId: Snowflake | null = null;
    let editedContent: string | null = null;

    if (parts.length > 0) {
      const candidateId = parts[0] as Snowflake;
      const exists = channelLog.messages.some((message) => message.id === candidateId);
      if (exists) {
        targetId = candidateId;
        editedContent = args.slice(candidateId.length).trim();
      } else {
        editedContent = args;
      }
    }

    const targetMessage = resolveMessageTarget(channelId, targetId);
    if (!targetMessage) {
      dispatch({ type: "ui/setCommandError", message: "Message not found in this channel." });
      return true;
    }

    if (targetMessage.author.id !== state.session.user.id) {
      dispatch({ type: "ui/setCommandError", message: "You can only edit your own messages." });
      return true;
    }

    if (!editedContent || editedContent.length === 0) {
      enterEditMode(targetMessage);
      return true;
    }

    const trimmedContent = editedContent.trim();
    if (!trimmedContent) {
      dispatch({ type: "ui/setCommandError", message: "Edited message cannot be empty." });
      return true;
    }

    if (trimmedContent === targetMessage.content) {
      dispatch({ type: "ui/setCommandError", message: "Message content is unchanged." });
      return true;
    }

    dispatchEditMutation(targetMessage, trimmedContent);
    return true;
  };

  const handleDeleteCommand = (input: string): boolean => {
    if (!input.startsWith("/delete")) {
      return false;
    }

    if (!state.session) {
      dispatch({ type: "ui/setCommandError", message: "Sign in before deleting." });
      return true;
    }

    const channelId = state.ui.activeChannelId;
    if (!channelId) {
      dispatch({ type: "ui/setCommandError", message: "Select a channel before deleting." });
      return true;
    }

    const args = input.slice("/delete".length).trim();
    const explicitId = args.length > 0 ? (args.split(/\s+/)[0] as Snowflake) : null;
    const targetMessage = resolveMessageTarget(channelId, explicitId);
    if (!targetMessage) {
      dispatch({ type: "ui/setCommandError", message: "Message not found in this channel." });
      return true;
    }

    if (targetMessage.author.id !== state.session.user.id) {
      dispatch({ type: "ui/setCommandError", message: "You can only delete your own messages." });
      return true;
    }

    dispatchDeleteMutation(targetMessage);
    setComposerValue("");
    return true;
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

    if (composerMode && key.escape) {
      setComposerMode(null);
      setComposerValue("");
      dispatch({ type: "ui/setCommandError", message: null });
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

    if (currentFocus === "messages" && !key.ctrl && !key.meta && input.length === 1) {
      const lower = input.toLowerCase();
      if (lower === "e") {
        if (!selectedMessage) {
          dispatch({ type: "ui/setCommandError", message: "No message selected to edit." });
          return;
        }
        if (!state.session || selectedMessage.author.id !== state.session.user.id) {
          dispatch({ type: "ui/setCommandError", message: "You can only edit your own messages." });
          return;
        }
        enterEditMode(selectedMessage);
        return;
      }
      if (lower === "x") {
        if (!selectedMessage) {
          dispatch({ type: "ui/setCommandError", message: "No message selected to delete." });
          return;
        }
        if (!state.session || selectedMessage.author.id !== state.session.user.id) {
          dispatch({ type: "ui/setCommandError", message: "You can only delete your own messages." });
          return;
        }
        dispatchDeleteMutation(selectedMessage);
        return;
      }
    }

    if (currentFocus === "composer") {
      if (key.return) {
        const trimmed = composerValue.trim();
        if (!trimmed) {
          return;
        }

        if (composerMode?.type === "edit") {
          const channelMessages = state.messagesByChannel[composerMode.channelId]?.messages ?? [];
          const targetMessage = channelMessages.find((message) => message.id === composerMode.messageId);
          if (!targetMessage) {
            dispatch({ type: "ui/setCommandError", message: "Original message no longer available." });
            setComposerMode(null);
            setComposerValue("");
            return;
          }

          if (targetMessage.author.id !== state.session?.user.id) {
            dispatch({ type: "ui/setCommandError", message: "You can only edit your own messages." });
            setComposerMode(null);
            setComposerValue("");
            return;
          }

          if (trimmed === composerMode.originalContent.trim()) {
            dispatch({ type: "ui/setCommandError", message: "Message content is unchanged." });
            return;
          }

          dispatchEditMutation(targetMessage, trimmed);
          return;
        }

        if (handleReactCommand(trimmed)) {
          return;
        }

        if (handleEditCommand(trimmed)) {
          return;
        }

        if (handleDeleteCommand(trimmed)) {
          return;
        }

        const channelId = state.ui.activeChannelId;
        if (!channelId) {
          return;
        }
        const clientId = makeOptimisticId();
        const createdAt = new Date().toISOString();
        setMessageOffset(0);
        dispatch({ type: "ui/setCommandError", message: null });
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

      if (!key.ctrl && !key.meta && input.length > 0) {
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
      {commandError ? (
        <Box marginBottom={1}>
          <Text color="red">{commandError}</Text>
        </Box>
      ) : null}
      {commandPaletteOpen ? (
        <Box
          marginBottom={1}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          paddingY={0}
          flexDirection="column"
          gap={0}
        >
          <Text color="cyan">Quick Commands & Shortcuts (ESC to dismiss)</Text>
          <Text>
            {kleur.cyan("Navigation: ")}TAB/SHIFT+TAB cycle panes · ↑/↓ scroll messages · ←/→ move focus
          </Text>
          <Text>
            {kleur.cyan("Composer: ")}/react &lt;emoji&gt; [messageId] · /edit to prefill composer · /delete [messageId]
          </Text>
          <Text>
            {kleur.cyan("Messages: ")}E edit selected · X delete selected · ENTER opens composer
          </Text>
          <Text>{kleur.cyan("System: ")}CTRL+P toggle help · CTRL+C quit</Text>
          <Text color="gray">Commands and shortcuts default to the selected message when no id is supplied.</Text>
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
          currentUserId={state.session?.user.id ?? null}
          selectedMessageId={selectedMessageId}
        />
        <MemberList
          members={state.members}
          memberIds={memberIds}
          focus={currentFocus === "members"}
        />
      </Box>
      <Box marginTop={1}>
        <Composer
          value={composerValue}
          focus={currentFocus === "composer"}
          mode={composerMode?.type === "edit" ? "edit" : "compose"}
        />
      </Box>
      {composerMode?.type === "edit" ? (
        <Box marginTop={0}>
          <Text color="yellow">Editing message – press ENTER to save or ESC to cancel</Text>
        </Box>
      ) : null}
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
