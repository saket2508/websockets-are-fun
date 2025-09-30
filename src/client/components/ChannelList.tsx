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

const colourForChannel = (channel: Channel) => {
  const { channels } = theme.palette;
  switch (channel.type) {
    case "voice":
      return channels.voice;
    case "thread":
      return channels.thread;
    default:
      return channels.text;
  }
};

export function ChannelList({ channels, activeChannelId, focus }: ChannelListProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;

  return (
    <Box flexDirection="column" width={28} borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>{kleur.bold("Channels")}</Text>
      {channels.length === 0 ? (
        <Text color={theme.text.muted}>No channels</Text>
      ) : (
        channels.map((channel, index) => {
          const colour = colourForChannel(channel);
          const isActive = channel.id === activeChannelId;
          const background = isActive ? theme.palette.selection : index % 2 === 0 ? "#0B1D3A" : undefined;
          return (
            <Text key={channel.id} color={colour} backgroundColor={background} bold={isActive}>
              {channelLabel(channel)}
            </Text>
          );
        })
      )}
    </Box>
  );
}
