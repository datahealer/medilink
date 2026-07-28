import React from "react";
import { Text, useColorScheme } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

import { I18nProvider } from "@/i18n";
import { ThemeProvider, useThemeContext } from "@/theme/ThemeProvider";
import { useThemeStore } from "@/stores/themeStore";
import { useTheme } from "@/hooks/useTheme";

import { darkColors } from "../dark";
import { lightColors } from "../light";

jest.mock("react-native/Libraries/Utilities/useColorScheme");

const mockedScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

/**
 * Theme resolution: the persisted user preference (light/dark/system) merged with the
 * OS colour scheme. Dark mode is a derived palette, not ad-hoc colours, so a broken
 * resolution silently ships unreadable screens.
 */
function Probe() {
  const { scheme, colors, mode } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="bg">{colors.background}</Text>
    </>
  );
}

/**
 * `useTheme` also reads `useI18n` (it exposes `isRTL` alongside the palette), so the
 * probe needs both providers — mirroring the real provider order in app/_layout.tsx.
 */
function renderProbe() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <Probe />
      </I18nProvider>
    </ThemeProvider>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    mockedScheme.mockReturnValue("light");
    act(() => useThemeStore.getState().setMode("system"));
  });

  it("follows the OS scheme in system mode", () => {
    renderProbe();
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("scheme")).toHaveTextContent("light");
    expect(screen.getByTestId("bg")).toHaveTextContent(lightColors.background);
  });

  it("follows the OS into dark in system mode", () => {
    mockedScheme.mockReturnValue("dark");
    renderProbe();
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
    expect(screen.getByTestId("bg")).toHaveTextContent(darkColors.background);
  });

  it("lets an explicit preference override the OS scheme", () => {
    // OS says dark, user pinned light → light must win.
    mockedScheme.mockReturnValue("dark");
    renderProbe();
    act(() => useThemeStore.getState().setMode("light"));

    expect(screen.getByTestId("scheme")).toHaveTextContent("light");
    expect(screen.getByTestId("bg")).toHaveTextContent(lightColors.background);
  });

  it("switches to dark on demand", () => {
    renderProbe();
    act(() => useThemeStore.getState().setMode("dark"));
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
    expect(screen.getByTestId("bg")).toHaveTextContent(darkColors.background);
  });

  it("defaults to light when the OS reports no scheme", () => {
    mockedScheme.mockReturnValue(null);
    renderProbe();
    expect(screen.getByTestId("scheme")).toHaveTextContent("light");
  });

  it("throws a clear error when the theme context is used outside the provider", () => {
    // A silent undefined here would surface as "cannot read colors of null" deep
    // inside an unrelated component. Uses useThemeContext (not useTheme) so the
    // assertion targets the theme guard rather than the i18n one.
    function Bare() {
      useThemeContext();
      return null;
    }
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});

describe("theme palettes", () => {
  it("defines every semantic colour role in both themes", () => {
    // Dark mode is a derived palette — a missing role renders `undefined`, which RN
    // treats as transparent (invisible text).
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it("uses a distinct background per theme", () => {
    expect(darkColors.background).not.toBe(lightColors.background);
  });

  it("has no undefined or empty colour values", () => {
    const empty = [...Object.entries(lightColors), ...Object.entries(darkColors)]
      .filter(([, value]) => typeof value !== "string" || value === "")
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });
});
