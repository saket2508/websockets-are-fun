import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import type { EnrichedMessage } from "../state";
import type { Reaction, Snowflake } from "../../shared/types";
import { theme } from "./theme";
import { renderMarkdownLines } from "../markdown";

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
  currentUserId: Snowflake | null;
  selectedMessageId: Snowflake | null;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const formatReactionSummary = (
  reactions: Reaction[],
  currentUserId: Snowflake | null,
): string | null => {
  if (reactions.length === 0) {
    return null;
  }

  const groups = new Map<string, Reaction[]>();
  for (const reaction of reactions) {
    const list = groups.get(reaction.emoji) ?? [];
    list.push(reaction);
    groups.set(reaction.emoji, list);
  }

  const parts = Array.from(groups.entries())
    .sort(([emojiA], [emojiB]) => emojiA.localeCompare(emojiB))
    .map(([emoji, items]) => {
      const label = `${emoji} ${items.length}`;
      const userReacted = currentUserId
        ? items.some((reaction) => reaction.authorId === currentUserId)
        : false;
      return userReacted ? kleur.inverse(label) : label;
    });

  return parts.join("  ");
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
  currentUserId,
  selectedMessageId,
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
          {messages.map((message) => {
            const rendered = renderMarkdownLines(message.content);
            const [first, ...rest] = rendered;
            const reactionSummary = formatReactionSummary(message.reactions, currentUserId);
            const isSelected = selectedMessageId === message.id;
            const name = kleur.bold(message.author.displayName ?? message.author.username);
            const prefix = isSelected ? kleur.cyan("➤") : " ";
            return (
              <Box key={message.id} flexDirection="column">
                <Text>
                  {prefix} {kleur.gray(`[${formatTime(message.createdAt)}]`)} {name}: {first ?? ""}
                </Text>
                {rest.map((line, index) => (
                  <Text key={`${message.id}-line-${index}`} color="gray">
                    {line ? `   ${line}` : ""}
                  </Text>
                ))}
                {reactionSummary ? (
                  <Text color={theme.text.accent}>{`   ${reactionSummary}`}</Text>
                ) : null}
              </Box>
            );
          })}
          {optimisticMessages.map((pending) => {
            const rendered = renderMarkdownLines(pending.content);
            const [first, ...rest] = rendered;
            const statusSuffix =
              pending.status === "pending"
                ? kleur.gray(" (sending…)")
                : pending.error
                ? kleur.red(` (${pending.error})`)
                : kleur.red(" (failed)");
            const color = pending.status === "error" ? theme.text.danger : theme.text.muted;
            return (
              <Box key={`pending-${pending.clientId}`} flexDirection="column">
                <Text color={color}>
                  {kleur.gray(`[${formatTime(pending.createdAt)}]`)} {kleur.bold(pending.authorName)}: {first ?? ""}
                  {statusSuffix}
                </Text>
                {rest.map((line, index) => (
                  <Text key={`pending-${pending.clientId}-line-${index}`} color={color}>
                    {line ? `   ${line}` : ""}
                  </Text>
                ))}
              </Box>
            );
          })}
        </>
      )}
      {hasNewer ? <Text color={theme.text.muted}>↓ Newer messages below (use ↓)</Text> : null}
    </Box>
  );
}
