/**
 * ErrorBoundary → reporter wiring.
 *
 * This is the acceptance test for "a thrown render error produces a reporter event". It is
 * worth a test because the failure is invisible: the boundary would still show its fallback
 * and the app would still look correct, while every production crash went unreported.
 *
 * It also pins the two things that make the fallback usable at all — that it renders instead
 * of a white screen, and that the component stack is what gets attached (the only context
 * that makes a minified production stack diagnosable).
 */
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { reportError } from "@/services/reporting";

jest.mock("@/services/reporting", () => ({
  reportError: jest.fn(),
}));

const mockedReport = reportError as jest.MockedFunction<typeof reportError>;

function Boom(): React.ReactElement {
  throw new Error("render exploded");
}

// The fallback consumes useTheme (which itself consumes useI18n), so both providers are
// required — see the note in ThemeProvider.test.tsx.
function renderBoundary(children: React.ReactNode) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
      </I18nProvider>
    </ThemeProvider>
  );
}

describe("ErrorBoundary", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockedReport.mockClear();
    // React logs the caught error itself; silence it so the run stays readable.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders children when nothing throws", () => {
    renderBoundary(<Text testID="ok">fine</Text>);
    expect(screen.getByTestId("ok")).toBeTruthy();
    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("reports a render error exactly once, tagged with its surface", () => {
    renderBoundary(<Boom />);

    expect(mockedReport).toHaveBeenCalledTimes(1);
    const call = mockedReport.mock.calls[0];
    if (!call) throw new Error("expected reportError to have been called");
    const [error, context] = call;
    expect((error as Error).message).toBe("render exploded");
    expect(context?.tags).toEqual({ surface: "error-boundary" });
    expect(context?.extra?.componentStack).toBeTruthy();
  });

  it("shows the recoverable fallback instead of an empty screen", () => {
    renderBoundary(<Boom />);
    // The localized crash copy, not a blank tree.
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });
});
