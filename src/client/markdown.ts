import kleur from "kleur";

const INLINE_CODE_REGEX = /`([^`]+)`/g;
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_REGEX = /(^|\s)\*([^*]+)\*(?=\s|$)/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

export const renderMarkdownLines = (content: string): string[] => {
  if (!content.trim()) {
    return [""];
  }

  const lines: string[] = [];
  const rawLines = content.split(/\r?\n/);
  let inCodeBlock = false;
  let codeFenceLanguage: string | null = null;

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\t/g, "    ");
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        codeFenceLanguage = null;
        lines.push(kleur.gray("```"));
      } else {
        inCodeBlock = true;
        codeFenceLanguage = trimmed.slice(3).trim() || null;
        const header = codeFenceLanguage ? `code (${codeFenceLanguage})` : "code";
        lines.push(kleur.gray("``` " + header));
      }
      continue;
    }

    if (inCodeBlock) {
      lines.push(kleur.cyan(` ${line}`));
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote = trimmed.replace(/^>\s?/, "");
      lines.push(`${kleur.gray("|")} ${applyInlineStyles(quote)}`);
      continue;
    }

    if (/^#+\s/.test(trimmed)) {
      const headingText = trimmed.replace(/^#+\s/, "");
      lines.push(kleur.bold(headingText.toUpperCase()));
      continue;
    }

    if (/^(?:\d+\.|[\-*+])\s+/.test(trimmed)) {
      const bullet = trimmed.replace(/^(?:\d+\.|[\-*+])\s+/, "");
      lines.push(`${kleur.gray("*")} ${applyInlineStyles(bullet)}`);
      continue;
    }

    if (trimmed === "") {
      lines.push("");
      continue;
    }

    lines.push(applyInlineStyles(line));
  }

  return lines;
};

const applyInlineStyles = (input: string): string => {
  let output = input;
  output = output.replace(
    LINK_REGEX,
    (_: string, text: string, url: string) => `${kleur.cyan(text)} ${kleur.gray("(" + url + ")")}`,
  );
  output = output.replace(BOLD_REGEX, (_: string, text: string) => kleur.bold(text));
  output = output.replace(
    ITALIC_REGEX,
    (match: string, prefix: string, text: string) => `${prefix}${kleur.italic(text)}`,
  );
  output = output.replace(INLINE_CODE_REGEX, (_: string, code: string) => kleur.yellow(` ${code} `));
  return output;
};
