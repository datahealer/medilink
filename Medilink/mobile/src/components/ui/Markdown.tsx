import React from "react";
import { View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import type { ThemeColors } from "@/theme/light";
import { Text } from "./Text";

interface MarkdownProps {
  children: string;
  /** Theme colour role for the body text. */
  color?: keyof ThemeColors;
}

/**
 * Minimal, dependency-free Markdown renderer for AI chat messages. Supports exactly what the
 * symptom-checker emits: **bold** inline spans, **Heading** lines (bold on their own line),
 * "• " / "- " / "* " bullet lists, and blank-line paragraph spacing. RTL- and theme-aware.
 * (Deliberately not a full CommonMark engine — no native dependency, no runtime surprises.)
 */
export function Markdown({ children, color = "text" }: MarkdownProps) {
  const { isRTL, spacing } = useTheme();
  const align = isRTL ? "right" : "left";
  const lines = (children ?? "").replace(/\r\n/g, "\n").split("\n");

  return (
    <View>
      {lines.map((rawLine, i) => {
        const line = rawLine.trim();
        if (line.length === 0) return <View key={i} style={{ height: spacing.xs }} />;

        // A line that is entirely bold => section heading.
        const headingMatch = /^\*\*(.+)\*\*:?$/.exec(line);
        if (headingMatch) {
          return (
            <Text key={i} variant="label" weight="700" color={color} align={align} style={{ marginTop: i === 0 ? 0 : spacing.sm }}>
              {headingMatch[1] ?? ""}
            </Text>
          );
        }

        // Bullet line.
        const bulletMatch = /^([•\-*])\s+(.*)$/.exec(line);
        if (bulletMatch) {
          return (
            <View key={i} style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 2 }}>
              <Text variant="body" color={color} style={isRTL ? { marginStart: 6 } : { marginEnd: 6 }}>•</Text>
              <Text variant="body" color={color} align={align} style={{ flex: 1 }}>
                {renderInline(bulletMatch[2] ?? "")}
              </Text>
            </View>
          );
        }

        // Normal paragraph (with inline **bold**).
        return (
          <Text key={i} variant="body" color={color} align={align} style={{ marginTop: 2 }}>
            {renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

/** Split a line into plain text + **bold** spans (nested <Text> inherits the parent style). */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} weight="700">
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}
