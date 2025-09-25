import React from "react";
import { Box, Text } from "ink";
import type { Guild, Snowflake } from "../../shared/types";
import { theme } from "./theme";

type GuildRailProps = {
  guilds: Guild[];
  activeGuildId: Snowflake | null;
  focus: boolean;
};

const palette = theme.palette.guilds;

const colourIndexFor = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index)) % palette.length;
  }
  return hash;
};

export function GuildRail({ guilds, activeGuildId, focus }: GuildRailProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;

  return (
    <Box
      flexDirection="column"
      width={20}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
    >
      <Text bold>Guilds</Text>
      {guilds.length === 0 ? (
        <Text color={theme.text.muted}>No guilds</Text>
      ) : (
        guilds.map((guild) => {
          const swatch = palette[colourIndexFor(guild.id)];
          const isActive = guild.id === activeGuildId;
          const letter = guild.name.trim().charAt(0)?.toUpperCase() ?? "?";

          return (
            <Box key={guild.id} flexDirection="row" gap={1}>
              <Text
                backgroundColor={swatch?.bg}
                color={swatch?.fg}
                bold={isActive}
              >
                {` ${letter} `}
              </Text>
              <Text
                color={isActive ? swatch?.accent : "white"}
                backgroundColor={isActive ? theme.palette.selection : undefined}
                bold={isActive}
              >
                {guild.name}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
