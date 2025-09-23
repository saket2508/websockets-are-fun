import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import type { Channel, Snowflake } from "../../shared/types";
import { theme } from "./theme";

type ChannelListProps = {
  channels: Channel[];
  activeChannelId: Snowflake | null;
  focus: boolean;
};

const channelLabel = (channel: Channel): string => {
  if (channel.type === "voice") {
    return `🔊 ${channel.name}`;
  }
  if (channel.type === "thread") {
    return `# ${channel.name}`;
  }
  return `# ${channel.name}`;
};

export function ChannelList({ channels, activeChannelId, focus }: ChannelListProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;

  return (
    <Box flexDirection="column" width={28} borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>{kleur.bold("Channels")}</Text>
      {channels.length === 0 ? (
        <Text color={theme.text.muted}>No channels</Text>
      ) : (
        channels.map((channel) => (
          <Text key={channel.id} color={channel.id === activeChannelId ? theme.text.accent : undefined}>
            {channelLabel(channel)}
          </Text>
        ))
      )}
    </Box>
  );
}
