/**
 * Pure rules for the Document Vault upload flow (app/(app)/records/upload.tsx).
 *
 * Extracted from the screen so they can be unit-tested: the bug this guards against was
 * a picked file failing SILENTLY, so the accept/reject decision is exactly the logic that
 * must not regress. No React, no native modules, no i18n — the caller maps a rejection
 * onto a localized message.
 */
import { mimeFromName } from "./mime";

/**
 * MIME types offered by the picker and accepted by the vault. Deliberately mirrors the
 * `DocumentPicker.getDocumentAsync` filter rather than inventing a narrower product rule —
 * a genuine bucket-level rejection still surfaces as a real upload error rather than being
 * pre-blocked here.
 */
export const PICKER_TYPES = ["application/pdf", "image/*"];

/**
 * Upload cap. The upload path materialises the whole file as an ArrayBuffer in JS memory
 * (`fetch(uri).arrayBuffer()` → `storage.upload` in data/real), so an oversized document is
 * a real out-of-memory risk on a low-end device. Rejecting it with a clear message is
 * strictly better than an OOM process kill.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "15 MB";

/** Why an asset cannot be uploaded, or `null` when it is acceptable. */
export type UploadRejection = "unsupported" | "tooLarge";

/** The shape both pickers reduce to (see PhotoAsset). */
export interface CandidateAsset {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number | null;
}

/** True for `application/pdf` and any `image/*`. Unknown/absent types are rejected. */
export function isAcceptedMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  return mime === "application/pdf" || mime.startsWith("image/");
}

/**
 * Resolve the effective MIME type for an asset: the picker's own value when present,
 * otherwise derived from the filename/URI extension.
 */
export function effectiveMime(a: CandidateAsset): string {
  return a.mimeType ?? mimeFromName(a.name ?? a.uri);
}

/**
 * Validate a picked asset. Returns the rejection reason, or `null` when it may be uploaded.
 *
 * A missing `size` is NOT a rejection — a camera capture does not always report one, and
 * refusing those would break the scan flow entirely. The cap only applies to sizes the
 * picker actually told us about.
 */
export function validateUploadAsset(a: CandidateAsset): UploadRejection | null {
  if (!isAcceptedMime(effectiveMime(a))) return "unsupported";
  if (a.size != null && a.size > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
}

/**
 * Both picker modules reject with a "picking in progress" error when one is already open
 * (`PickingInProgressException`). That deserves a "close it and retry" message rather than
 * the raw native text.
 */
export function isPickerBusyError(detail: string): boolean {
  return /in progress|already/i.test(detail);
}
