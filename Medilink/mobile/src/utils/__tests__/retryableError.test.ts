import { ApiError } from "@/services/api";
import { isRetryableError, isSessionExpired } from "../retryableError";

/**
 * Retry-affordance rule.
 *
 * Protects a user-facing promise: a "Retry" button that can never succeed is worse than no
 * button, because the patient spends attempts on it before looking for the real recovery.
 * These cases are the ones that actually reach the AI screens in production.
 */
describe("isRetryableError", () => {
  describe("NOT retryable — replaying the request cannot help", () => {
    it("401: the session is gone, so the same call fails identically", () => {
      expect(isRetryableError(new ApiError(401, "Unauthorized"))).toBe(false);
    });

    it("403: the caller is not permitted, and pressing again does not grant permission", () => {
      expect(isRetryableError(new ApiError(403, "Forbidden"))).toBe(false);
    });

    it("400: the request itself is malformed", () => {
      expect(isRetryableError(new ApiError(400, "Bad Request"))).toBe(false);
    });

    it("404: the resource is gone and will not return on a replay", () => {
      expect(isRetryableError(new ApiError(404, "Not Found"))).toBe(false);
    });

    it("409: a state conflict is not resolved by repeating the same write", () => {
      expect(isRetryableError(new ApiError(409, "Conflict"))).toBe(false);
    });

    it("422: validation rejected the payload, which has not changed", () => {
      expect(isRetryableError(new ApiError(422, "Unprocessable"))).toBe(false);
    });
  });

  describe("retryable — the failure is transient", () => {
    it("500: a server fault may well not recur", () => {
      expect(isRetryableError(new ApiError(500, "Server Error"))).toBe(true);
    });

    it("502/503/504: gateway and availability faults are the canonical retry case", () => {
      expect(isRetryableError(new ApiError(502, "Bad Gateway"))).toBe(true);
      expect(isRetryableError(new ApiError(503, "Unavailable"))).toBe(true);
      expect(isRetryableError(new ApiError(504, "Gateway Timeout"))).toBe(true);
    });

    it("429: rate limiting explicitly invites a later retry, despite being 4xx", () => {
      expect(isRetryableError(new ApiError(429, "Too Many Requests"))).toBe(true);
    });

    it("408: a request timeout is transient, despite being 4xx", () => {
      expect(isRetryableError(new ApiError(408, "Request Timeout"))).toBe(true);
    });

    it("a dropped mobile connection (plain Error) is retryable", () => {
      expect(isRetryableError(new Error("Network request failed"))).toBe(true);
    });

    it("an unrecognised throw defaults to retryable rather than stranding the patient", () => {
      expect(isRetryableError("something odd")).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
      expect(isRetryableError(null)).toBe(true);
    });
  });

  it("never confuses the two 4xx transient codes with the rest of the 4xx block", () => {
    const transient = [408, 429];
    for (let status = 400; status < 500; status++) {
      expect(isRetryableError(new ApiError(status, "x"))).toBe(transient.includes(status));
    }
  });
});

describe("isSessionExpired", () => {
  it("is true only for 401", () => {
    expect(isSessionExpired(new ApiError(401, "Unauthorized"))).toBe(true);
    expect(isSessionExpired(new ApiError(403, "Forbidden"))).toBe(false);
    expect(isSessionExpired(new ApiError(500, "Server Error"))).toBe(false);
  });

  it("is false for a non-ApiError, so a network blip never reads as a sign-out", () => {
    expect(isSessionExpired(new Error("Network request failed"))).toBe(false);
  });
});
