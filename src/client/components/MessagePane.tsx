import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import type { EnrichedMessage } from "../state";
import { theme } from "./theme";

type MessagePaneProps = {
  channelName: string | null;
  messages: EnrichedMessage[];
  optimisticMessages: Array<{
    clientId: string;
    content: string;
    createdAt: string;
    status: "pending" | "error";
    error?: string;
    authorName: string;
  }>;
  hasLoaded: boolean;
  focus: boolean;
  authError: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

export function MessagePane({
  channelName,
  messages,
  optimisticMessages,
  hasLoaded,
  focus,
  authError,
  hasOlder,
  hasNewer,
}: MessagePaneProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;
  const hasAnyMessages = messages.length > 0 || optimisticMessages.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>{kleur.bold(channelName ? `#${channelName}` : "Messages")}</Text>
      {authError ? <Text color={theme.text.danger}>{authError}</Text> : null}
      {hasOlder ? <Text color={theme.text.muted}>↑ Older messages available (use ↑)</Text> : null}
      {!hasLoaded ? (
        <Text color={theme.text.muted}>Loading history…</Text>
      ) : !hasAnyMessages ? (
        <Text color={theme.text.muted}>No messages yet. Start the conversation!</Text>
      ) : (
        <>
          {messages.map((message) => (
            <Text key={message.id}>
              {kleur.gray(`[${formatTime(message.createdAt)}]`)} {kleur.bold(message.author.displayName ?? message.author.username)}: {message.content}
            </Text>
          ))}
          {optimisticMessages.map((pending) => (
            <Text
              key={`pending-${pending.clientId}`}
              color={pending.status === "error" ? theme.text.danger : theme.text.muted}
            >
              {kleur.gray(`[${formatTime(pending.createdAt)}]`)} {kleur.bold(pending.authorName)}: {pending.content}
              {pending.status === "pending"
                ? kleur.gray(" (sending…)")
                : pending.error
                ? kleur.red(` (${pending.error})`)
                : kleur.red(" (failed)")}
            </Text>
          ))}
        </>
      )}
      {hasNewer ? <Text color={theme.text.muted}>↓ Newer messages below (use ↓)</Text> : null}
    </Box>
  );
}
