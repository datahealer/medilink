/**
 * Document Vault upload rules.
 *
 * Worth testing because the bug these guard against was INVISIBLE: a picked file that the
 * flow could not handle produced no error, no alert and no upload — the button simply
 * looked dead. Every case below is a file a patient can realistically pick from the
 * document picker or the camera.
 */
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  PICKER_TYPES,
  effectiveMime,
  isAcceptedMime,
  isPickerBusyError,
  validateUploadAsset,
  type CandidateAsset,
} from "@/utils/documentUpload";

const asset = (over: Partial<CandidateAsset> = {}): CandidateAsset => ({
  uri: "file:///cache/DocumentPicker/scan.jpg",
  name: "scan.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  ...over,
});

describe("isAcceptedMime", () => {
  it("accepts PDF and every image subtype the pickers can return", () => {
    // HEIC matters specifically: it is the iOS camera/photo-library default, so
    // rejecting it would break the scan flow on iPhone.
    for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]) {
      expect(isAcceptedMime(mime)).toBe(true);
    }
  });

  it("rejects unknown, absent and non-document types", () => {
    // application/octet-stream is what mimeFromName returns for an unrecognised
    // extension — treating it as uploadable would push junk into the vault.
    for (const mime of ["application/octet-stream", "video/mp4", "text/csv", "", undefined, null]) {
      expect(isAcceptedMime(mime)).toBe(false);
    }
  });
});

describe("effectiveMime", () => {
  it("prefers the picker's own MIME type", () => {
    expect(effectiveMime(asset({ mimeType: "application/pdf", name: "x.jpg" }))).toBe("application/pdf");
  });

  it("derives from the filename when the picker supplies none", () => {
    expect(effectiveMime(asset({ mimeType: undefined, name: "report.pdf" }))).toBe("application/pdf");
  });

  it("falls back to the URI when there is no filename (camera captures)", () => {
    // launchCameraAsync returns fileName: null on iOS, so the URI is the only signal.
    expect(
      effectiveMime({ uri: "file:///var/mobile/ImagePicker/ABC-123.jpeg", mimeType: undefined })
    ).toBe("image/jpeg");
  });
});

describe("validateUploadAsset", () => {
  it("accepts a normal capture", () => {
    expect(validateUploadAsset(asset())).toBeNull();
  });

  it("accepts a PDF picked from the document picker", () => {
    expect(validateUploadAsset(asset({ name: "labs.pdf", mimeType: "application/pdf" }))).toBeNull();
  });

  it("rejects a file whose type the vault cannot take", () => {
    expect(validateUploadAsset(asset({ name: "clip.mp4", mimeType: "video/mp4" }))).toBe("unsupported");
  });

  it("rejects a file above the memory cap", () => {
    // The upload path buffers the whole file in JS memory, so this is the guard that
    // turns an OOM process kill into a readable message.
    expect(validateUploadAsset(asset({ size: MAX_UPLOAD_BYTES + 1 }))).toBe("tooLarge");
  });

  it("accepts a file exactly at the cap", () => {
    expect(validateUploadAsset(asset({ size: MAX_UPLOAD_BYTES }))).toBeNull();
  });

  it("accepts an asset with no reported size", () => {
    // A camera capture does not always report fileSize; refusing those would break
    // the entire scan flow, which is the more harmful failure.
    expect(validateUploadAsset(asset({ size: null }))).toBeNull();
    expect(validateUploadAsset(asset({ size: undefined }))).toBeNull();
  });

  it("checks type before size", () => {
    expect(validateUploadAsset(asset({ mimeType: "video/mp4", size: MAX_UPLOAD_BYTES + 1 }))).toBe(
      "unsupported"
    );
  });
});

describe("isPickerBusyError", () => {
  it("recognises the native picking-in-progress rejection", () => {
    // Both expo-image-picker and expo-document-picker throw this when a pick is already
    // open — the double-tap case that used to leave the button permanently dead.
    expect(isPickerBusyError("Different document picking in progress. Await other adapter request")).toBe(true);
    expect(isPickerBusyError("A picker is already open")).toBe(true);
  });

  it("does not swallow unrelated failures behind the busy message", () => {
    expect(isPickerBusyError("Cannot find native module 'ExpoDocumentPicker'")).toBe(false);
    expect(isPickerBusyError("User rejected permissions")).toBe(false);
  });
});

describe("picker configuration", () => {
  it("offers exactly PDF + images, matching what the vault accepts", () => {
    expect(PICKER_TYPES).toEqual(["application/pdf", "image/*"]);
    for (const t of PICKER_TYPES) {
      // Every type the picker offers must pass validation, or the user could select a
      // file and then be told it is unsupported.
      expect(isAcceptedMime(t.replace("/*", "/jpeg"))).toBe(true);
    }
  });

  it("keeps the cap label in step with the byte cap", () => {
    expect(MAX_UPLOAD_LABEL).toBe(`${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  });
});
