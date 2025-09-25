import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import type { Member, Snowflake } from "../../shared/types";
import { theme } from "./theme";

type MemberListProps = {
  members: Record<Snowflake, Member>;
  memberIds: Snowflake[];
  focus: boolean;
};

const palette = theme.palette.members;

const colourIndexFor = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index)) % palette.length;
  }
  return hash;
};

const displayNameForMember = (member: Member) => {
  if (member.nickname) {
    return member.nickname;
  }
  return member.userId.slice(-6);
};

export function MemberList({ members, memberIds, focus }: MemberListProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;
  return (
    <Box flexDirection="column" width={24} borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>{kleur.bold("Members")}</Text>
      {memberIds.length === 0 ? (
        <Text color={theme.text.muted}>No members</Text>
      ) : (
        memberIds.map((memberId) => {
          const member = members[memberId];
          if (!member) {
            return null;
          }

          const colour = palette[colourIndexFor(member.userId)];
          return (
            <Text key={memberId} color={colour}>
              {member.muted ? "🔇" : "🟢"} {displayNameForMember(member)}
            </Text>
          );
        })
      )}
    </Box>
  );
}
