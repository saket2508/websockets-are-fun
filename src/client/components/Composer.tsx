import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import { theme } from "./theme";

type ComposerProps = {
  value: string;
  focus: boolean;
};

export function Composer({ value, focus }: ComposerProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;
  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Text>
        {"> "}
        {value.length === 0 ? kleur[focus ? "white" : "gray"]("Type a message…") : value}
      </Text>
    </Box>
  );
}
