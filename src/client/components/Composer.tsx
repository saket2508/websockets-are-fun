import React from "react";
import { Box, Text } from "ink";
import kleur from "kleur";
import { theme } from "./theme";

type ComposerProps = {
  value: string;
  focus: boolean;
  mode: "compose" | "edit";
};

export function Composer({ value, focus, mode }: ComposerProps) {
  const borderColor = focus ? theme.borders.focused : theme.borders.unfocused;
  const promptSymbol = mode === "edit" ? "✏️ " : "> ";
  const placeholder =
    mode === "edit" ? "Editing message… (ESC to cancel)" : "Type a message…";
  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
    >
      <Text>
        {promptSymbol}
        {value.length === 0
          ? kleur[focus ? "white" : "gray"](placeholder)
          : value}
      </Text>
    </Box>
  );
}
