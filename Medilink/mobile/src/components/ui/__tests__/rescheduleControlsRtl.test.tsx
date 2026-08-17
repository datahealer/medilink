import React from "react";
import { act, render, screen } from "@testing-library/react-native";

import { I18nProvider } from "@/i18n";
import { useLocaleStore } from "@/stores/localeStore";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppHeader } from "../AppHeader";
import { DayGrid, type DayItem } from "../DayGrid";
import { SlotGrid } from "../SlotGrid";
import { Text } from "../Text";

/**
 * RTL layout contract for the appointment RESCHEDULE controls.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * The 2026-08-11 production audit flagged `appointments/[id]/reschedule.tsx` as needing an
 * RTL pass because the file contains zero `isRTL` references. That metric is a proxy, and
 * here it is a FALSE POSITIVE: the screen declares no row layout of its own. It composes
 * `AppHeader`, `DayGrid`, `SlotGrid`, `Text` and `Button`, and every one of those mirrors
 * itself. A screen that adds no physical direction has nothing to mirror.
 *
 * But that also means the screen's Arabic correctness is entirely INHERITED — it depends on
 * primitives it does not control, and nothing was asserting that. Delete `row-reverse` from
 * DayGrid and the reschedule date strip silently runs backwards in Arabic with no test, no
 * typecheck error and no lint warning to catch it.
 *
 * So the guard belongs on the primitives, which is also why this test lives under `src/`
 * (Jest's `testMatch` covers `src/**` only, never `app/**`).
 *
 * These are the four controls a patient actually touches when rescheduling: the header and
 * its back chevron, the day strip, the slot pills, and the section label.
 */

/** Render inside the real providers so `isRTL` flows from the locale, not a stub. */
function renderRtl(ui: React.ReactElement, locale: "en" | "ar") {
  act(() => useLocaleStore.getState().setLocale(locale));
  return render(
    <ThemeProvider>
      <I18nProvider>{ui}</I18nProvider>
    </ThemeProvider>
  );
}

/** Flatten a possibly-nested RN style prop into one object. */
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const raw = node.props.style;
  const parts = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
  return Object.assign({}, ...parts.filter((p) => p && typeof p === "object"));
}

const FIRST_DAY_ID = "2026-08-17";

const DAYS: DayItem[] = [
  { id: FIRST_DAY_ID, top: "Sun", bottom: "17" },
  { id: "2026-08-18", top: "Mon", bottom: "18" },
  { id: "2026-08-19", top: "Tue", bottom: "19" },
];

const SLOTS = ["09:00", "09:30", "10:00"];

afterEach(() => {
  act(() => useLocaleStore.getState().setLocale("en"));
});

describe("DayGrid — the reschedule date strip", () => {
  it("runs left-to-right in English", () => {
    renderRtl(<DayGrid items={DAYS} selectedId={FIRST_DAY_ID} onSelect={() => {}} />, "en");
    const row = screen.getByTestId("day-grid-row");
    expect(flatStyle(row).flexDirection).toBe("row");
  });

  it("MIRRORS to right-to-left in Arabic, so the earliest day sits at the inline start", () => {
    renderRtl(<DayGrid items={DAYS} selectedId={FIRST_DAY_ID} onSelect={() => {}} />, "ar");
    const row = screen.getByTestId("day-grid-row");
    expect(flatStyle(row).flexDirection).toBe("row-reverse");
  });

  it("keeps the chronological order of the items themselves in both locales", () => {
    // Mirroring is a LAYOUT concern. The array must not be reversed as well, or the two
    // reversals cancel and Arabic renders in the wrong order while looking plausible.
    for (const locale of ["en", "ar"] as const) {
      const view = renderRtl(<DayGrid items={DAYS} selectedId={FIRST_DAY_ID} onSelect={() => {}} />, locale);
      const labels = screen.getAllByText(/^(17|18|19)$/).map((n) => n.props.children);
      expect(labels).toEqual(["17", "18", "19"]);
      view.unmount();
    }
  });
});

describe("SlotGrid — the reschedule time picker", () => {
  it("runs left-to-right in English", () => {
    renderRtl(<SlotGrid slots={SLOTS} onSelect={() => {}} />, "en");
    expect(flatStyle(screen.getByTestId("slot-grid-wrap")).flexDirection).toBe("row");
  });

  it("MIRRORS to right-to-left in Arabic", () => {
    renderRtl(<SlotGrid slots={SLOTS} onSelect={() => {}} />, "ar");
    expect(flatStyle(screen.getByTestId("slot-grid-wrap")).flexDirection).toBe("row-reverse");
  });

  it("wraps in both locales, so a full day of slots cannot overflow off-screen", () => {
    for (const locale of ["en", "ar"] as const) {
      const view = renderRtl(<SlotGrid slots={SLOTS} onSelect={() => {}} />, locale);
      expect(flatStyle(screen.getByTestId("slot-grid-wrap")).flexWrap).toBe("wrap");
      view.unmount();
    }
  });
});

describe("AppHeader — the reschedule header", () => {
  it("mirrors the header row in Arabic", () => {
    renderRtl(<AppHeader title="إعادة جدولة" showBack />, "ar");
    expect(flatStyle(screen.getByTestId("app-header-row")).flexDirection).toBe("row-reverse");
  });

  it("does not mirror in English", () => {
    renderRtl(<AppHeader title="Reschedule" showBack />, "en");
    expect(flatStyle(screen.getByTestId("app-header-row")).flexDirection).toBe("row");
  });
});

describe("Text — the section labels above each control", () => {
  it("aligns and sets writing direction from the locale WITHOUT the screen passing isRTL", () => {
    // This is the property that makes reschedule.tsx correct despite having no `isRTL`:
    // every label it renders inherits the right alignment from the primitive.
    renderRtl(<Text variant="label">اختر موعدًا</Text>, "ar");
    const ar = flatStyle(screen.getByText("اختر موعدًا"));
    expect(ar.textAlign).toBe("right");
    expect(ar.writingDirection).toBe("rtl");
  });

  it("falls back to left/ltr in English", () => {
    renderRtl(<Text variant="label">Choose a slot</Text>, "en");
    const en = flatStyle(screen.getByText("Choose a slot"));
    expect(en.textAlign).toBe("left");
    expect(en.writingDirection).toBe("ltr");
  });

  it("still honours an explicit align, so centred labels are not clobbered", () => {
    renderRtl(<Text variant="label" align="center">10:30</Text>, "ar");
    expect(flatStyle(screen.getByText("10:30")).textAlign).toBe("center");
  });
});
