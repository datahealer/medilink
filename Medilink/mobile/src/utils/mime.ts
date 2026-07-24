/**
 * Best-effort MIME type from a file name/URI extension. Used when a picker doesn't
 * supply an explicit `mimeType`, so uploads (images AND PDFs) get the correct content
 * type instead of a hardcoded `image/jpeg`.
 */
export function mimeFromName(name: string | null | undefined): string {
  const ext = (name ?? "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
