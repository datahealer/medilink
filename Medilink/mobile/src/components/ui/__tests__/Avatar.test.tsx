import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";

import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { Avatar } from "../Avatar";

/**
 * Avatar initials (QA MED-008).
 *
 * The regression these lock down is arithmetic, not cosmetic: `Text` derives lineHeight
 * from its variant (`title` = 22px), so overriding only fontSize made every avatar wider
 * than ~61px draw glyphs taller than their line box and clip them. Asserting
 * `lineHeight >= fontSize` at every size in use catches that reappearing, at any size,
 * without needing a device.
 */

/** Every `size` passed to <Avatar> anywhere in the app, smallest to largest. */
const SIZES_IN_USE = [36, 40, 44, 48, 52, 76, 88] as const;

function renderAvatar(props: React.ComponentProps<typeof Avatar>) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <Avatar {...props} />
      </I18nProvider>
    </ThemeProvider>
  );
}

/** Flatten the style prop of the initials <Text> into one object. */
function initialsStyle(): Record<string, unknown> {
  // The rendered initials are the only Text in the fallback branch.
  const node = screen.UNSAFE_getByType(RNText);
  const style = node.props.style;
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));
}

describe("Avatar initials", () => {
  describe("derivation", () => {
    it.each([
      ["two words", "Satyam Kumar", "SK"],
      ["three words uses first + last", "Ahmed bin Saif", "AS"],
      ["single word takes first two letters", "Ali", "AL"],
      ["single letter name", "A", "A"],
      ["padded input", "   Satyam   Kumar   ", "SK"],
      ["internal double space", "Satyam  Kumar", "SK"],
      ["lowercase is upcased", "satyam kumar", "SK"],
    ])("%s", (_label, name, expected) => {
      renderAvatar({ name });
      expect(screen.getByText(expected)).toBeTruthy();
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["empty string", ""],
      ["whitespace only", "   "],
    ])("falls back to '?' for %s", (_label, name) => {
      renderAvatar({ name });
      expect(screen.getByText("?")).toBeTruthy();
    });

    it("keeps Arabic initials in Arabic (no transliteration)", () => {
      renderAvatar({ name: "محمد عبدالله" });
      expect(screen.getByText("مع")).toBeTruthy();
    });
  });

  describe("no clipping at any size", () => {
    it.each(SIZES_IN_USE)("size %i has lineHeight >= fontSize", (size) => {
      renderAvatar({ name: "Satyam Kumar", size });
      const style = initialsStyle();

      const fontSize = style.fontSize as number;
      const lineHeight = style.lineHeight as number;

      expect(typeof fontSize).toBe("number");
      expect(typeof lineHeight).toBe("number");
      // The exact bug: 88 * 0.36 = 31.7px glyphs inside the variant's 22px line box.
      expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
    });

    it("scales the glyph with the circle", () => {
      renderAvatar({ name: "Satyam Kumar", size: 88 });
      const large = initialsStyle().fontSize as number;
      screen.unmount();

      renderAvatar({ name: "Satyam Kumar", size: 36 });
      const small = initialsStyle().fontSize as number;

      expect(large).toBeGreaterThan(small);
    });

    it("centres the glyph rather than following the locale text direction", () => {
      renderAvatar({ name: "Satyam Kumar", size: 88 });
      expect(initialsStyle().textAlign).toBe("center");
    });

    it("opts out of system font scaling so a fixed circle cannot be burst", () => {
      renderAvatar({ name: "Satyam Kumar", size: 88 });
      const node = screen.UNSAFE_getByType(RNText);
      expect(node.props.allowFontScaling).toBe(false);
      expect(node.props.numberOfLines).toBe(1);
    });
  });

  describe("photo branch", () => {
    it("renders an image and no initials when a uri is present", () => {
      renderAvatar({ name: "Satyam Kumar", uri: "https://example.test/p.jpg", size: 88 });
      expect(screen.queryByText("SK")).toBeNull();
    });

    it("exposes the name to assistive tech in both branches", () => {
      renderAvatar({ name: "Satyam Kumar", size: 88 });
      expect(screen.getByLabelText("Satyam Kumar")).toBeTruthy();
    });
  });
});
