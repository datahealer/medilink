import React from "react";
import { Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";

import { I18nProvider, useI18n } from "@/i18n";
import { useLocaleStore } from "@/stores/localeStore";

import { en } from "../en";
import { ar } from "../ar";

/**
 * Localization + runtime RTL.
 *
 * Runtime RTL (JS `isRTL`, native layout kept LTR) is the mechanism that removed the
 * app-restart requirement when switching en↔ar. That behaviour is load-bearing for
 * the whole Arabic experience, so it is verified here rather than only by hand.
 */

/** Probe that surfaces the context so assertions read off rendered output. */
function Probe() {
  const { locale, dir, isRTL, t, num } = useI18n();
  return (
    <>
      <Text testID="locale">{locale}</Text>
      <Text testID="dir">{dir}</Text>
      <Text testID="isRTL">{String(isRTL)}</Text>
      <Text testID="title">{t("appointments.title")}</Text>
      <Text testID="interp">{t("appointments.inDays", { n: 3 })}</Text>
      <Text testID="num">{num(42)}</Text>
    </>
  );
}

function renderProbe() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    // The locale is persisted in a Zustand store; reset so tests don't leak.
    act(() => useLocaleStore.getState().setLocale("en"));
  });

  it("defaults to English, LTR", () => {
    renderProbe();
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
    expect(screen.getByTestId("isRTL")).toHaveTextContent("false");
    expect(screen.getByTestId("title")).toHaveTextContent(en.appointments.title);
  });

  it("switches to Arabic and flips direction with no remount or restart", () => {
    renderProbe();
    act(() => useLocaleStore.getState().setLocale("ar"));

    expect(screen.getByTestId("locale")).toHaveTextContent("ar");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
    expect(screen.getByTestId("isRTL")).toHaveTextContent("true");
    // The Arabic string appears immediately in the SAME render tree — this is the
    // proof that no reload is required.
    expect(screen.getByTestId("title")).toHaveTextContent(ar.appointments.title);
  });

  it("switches back to English", () => {
    renderProbe();
    act(() => useLocaleStore.getState().setLocale("ar"));
    act(() => useLocaleStore.getState().setLocale("en"));

    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
    expect(screen.getByTestId("title")).toHaveTextContent(en.appointments.title);
  });

  it("interpolates variables", () => {
    renderProbe();
    expect(screen.getByTestId("interp")).toHaveTextContent("in 3 days");
  });

  it("interpolates into the Arabic template too", () => {
    renderProbe();
    act(() => useLocaleStore.getState().setLocale("ar"));
    expect(screen.getByTestId("interp")).toHaveTextContent("خلال 3 أيام");
  });

  it("keeps Western numerals in Arabic (deliberate product decision)", () => {
    // src/utils/format.ts documents this: the Arabic UI uses Latin digits 0-9, NOT
    // Eastern-Arabic-Indic (٠١٢…). Locked in here so a future "fix" to Arabic-Indic
    // numerals is a failing test rather than a silent UX change.
    renderProbe();
    expect(screen.getByTestId("num")).toHaveTextContent("42");

    act(() => useLocaleStore.getState().setLocale("ar"));
    expect(screen.getByTestId("num")).toHaveTextContent("42");
  });

  it("falls back to the raw key for a missing message rather than crashing", () => {
    function MissingKey() {
      const { t } = useI18n();
      // Cast: deliberately probing an unmapped key, which the type system forbids.
      return <Text testID="missing">{t("does.not.exist" as never)}</Text>;
    }
    render(
      <I18nProvider>
        <MissingKey />
      </I18nProvider>
    );
    expect(screen.getByTestId("missing")).toHaveTextContent("does.not.exist");
  });
});

describe("message catalogs", () => {
  /** Collect every dot-path leaf of a catalog. */
  function leaves(obj: unknown, prefix = ""): string[] {
    if (obj === null || typeof obj !== "object") return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k)
    );
  }

  it("has full Arabic coverage for every English key", () => {
    // A missing Arabic key silently falls back to the raw key string (not a crash),
    // which ships as visible gibberish like "queue.title" to Arabic users.
    const missing = leaves(en).filter((k) => !leaves(ar).includes(k));
    expect(missing).toEqual([]);
  });

  it("has no orphaned Arabic keys", () => {
    const orphaned = leaves(ar).filter((k) => !leaves(en).includes(k));
    expect(orphaned).toEqual([]);
  });

  it("keeps interpolation placeholders identical across locales", () => {
    // A dropped `{mins}` in Arabic would render a literal brace to the user.
    const enLeaves = leaves(en);
    const placeholdersOf = (catalog: unknown, key: string): string[] => {
      const value = key.split(".").reduce<unknown>(
        (acc, part) =>
          acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
        catalog
      );
      return typeof value === "string" ? (value.match(/\{(\w+)\}/g) ?? []).sort() : [];
    };

    const mismatched = enLeaves.filter((key) => {
      const a = placeholdersOf(en, key);
      const b = placeholdersOf(ar, key);
      return a.join(",") !== b.join(",");
    });
    expect(mismatched).toEqual([]);
  });
});
