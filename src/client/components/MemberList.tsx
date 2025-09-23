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

          return (
            <Text key={memberId}>
              {member.muted ? "🔇" : " "} {displayNameForMember(member)}
            </Text>
          );
        })
      )}
    </Box>
  );
}
