import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";

import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { Icon } from "../Icon";
import { PasswordField } from "../PasswordField";

/**
 * Password show/hide toggle (QA MED-002).
 *
 * Three invariants that are easy to break together, and were:
 *   1. `secureTextEntry` actually follows the toggle (the masking itself).
 *   2. The ICON reflects the CURRENT STATE  — masked = slashed, visible = open.
 *   3. The A11Y LABEL reflects the NEXT ACTION — masked = "Show", visible = "Hide".
 *
 * (2) and (3) are deliberately inverted relative to one another. A future "cleanup" that
 * aligns them re-creates the original bug, so both are pinned here.
 *
 * PasswordField is shared by sign-in, sign-up and both reset-password fields, so this
 * covers every password input in the app.
 */

function renderField() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <PasswordField label="Password" value="" onChangeText={() => {}} />
      </I18nProvider>
    </ThemeProvider>
  );
}

const input = () => screen.UNSAFE_getByType(TextInput);
/** The toggle is the only element with an accessibility button role. */
const toggle = () => screen.getByRole("button");
/** Icon exposes no testID, so assert on the glyph name it was asked to draw. */
const iconName = () => screen.UNSAFE_getByType(Icon).props.name as string;

describe("PasswordField", () => {
  it("starts masked", () => {
    renderField();
    expect(input().props.secureTextEntry).toBe(true);
  });

  it("starts with the slashed-eye icon (state: hidden)", () => {
    renderField();
    expect(iconName()).toBe("eye-off");
  });

  it("starts with the 'Show password' action label", () => {
    renderField();
    expect(toggle().props.accessibilityLabel).toBe("Show password");
  });

  describe("after tapping the toggle", () => {
    beforeEach(() => {
      renderField();
      fireEvent.press(toggle());
    });

    it("unmasks the input", () => {
      expect(input().props.secureTextEntry).toBe(false);
    });

    it("switches to the open-eye icon (state: visible)", () => {
      expect(iconName()).toBe("eye");
    });

    it("switches to the 'Hide password' action label", () => {
      expect(toggle().props.accessibilityLabel).toBe("Hide password");
    });
  });

  it("returns to masked + slashed eye on a second tap", () => {
    renderField();
    fireEvent.press(toggle());
    fireEvent.press(toggle());

    expect(input().props.secureTextEntry).toBe(true);
    expect(iconName()).toBe("eye-off");
    expect(toggle().props.accessibilityLabel).toBe("Show password");
  });

  it("keeps icon and mask in lockstep across several toggles", () => {
    renderField();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(toggle());
      const masked = input().props.secureTextEntry as boolean;
      // The whole point of MED-002: these two must never disagree.
      expect(iconName()).toBe(masked ? "eye-off" : "eye");
    }
  });

  it("does not leak the value into the placeholder", () => {
    renderField();
    expect(input().props.placeholder).toBeUndefined();
  });
});
