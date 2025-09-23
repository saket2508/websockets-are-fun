import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import type { Guild, Snowflake } from "../../shared/types";
import { theme } from "./theme";

type GuildRailProps = {
  guilds: Guild[];
  activeGuildId: Snowflake | null;
  focus: boolean;
};

const badgeForGuild = (guild: Guild) => {
  const letter = guild.name.trim().charAt(0)?.toUpperCase() ?? "?";
  return kleur.bgCyan().black(` ${letter} `);
};

export function GuildRail({ guilds, activeGuildId, focus }: GuildRailProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;

  return (
    <Box flexDirection="column" width={20} borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>{kleur.bold("Guilds")}</Text>
      {guilds.length === 0 ? (
        <Text color={theme.text.muted}>No guilds</Text>
      ) : (
        guilds.map((guild) => (
          <Box key={guild.id} flexDirection="row" gap={1}>
            <Text>{badgeForGuild(guild)}</Text>
            <Text color={guild.id === activeGuildId ? theme.text.accent : undefined}>{guild.name}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
