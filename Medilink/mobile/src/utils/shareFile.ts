import { Share } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

/** Map a MIME type to the iOS Uniform Type Identifier expo-sharing expects. */
const UTI_BY_MIME: Record<string, string> = {
  "application/pdf": "com.adobe.pdf",
  "image/jpeg": "public.jpeg",
  "image/jpg": "public.jpeg",
  "image/png": "public.png",
  "image/heic": "public.heic",
};

/** Derive a safe local filename (with extension) from the URL, else the fallback. */
function filenameFor(url: string, fallback: string): string {
  try {
    const path = url.split("?")[0]!.split("#")[0]!;
    const last = decodeURIComponent(path.substring(path.lastIndexOf("/") + 1));
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) {
      // Keep the real extension; sanitise the stem for the filesystem.
      return last.replace(/[^A-Za-z0-9._-]/g, "_");
    }
  } catch {
    // fall through to the fallback name
  }
  return fallback;
}

/**
 * Share a remote file (e.g. a Supabase signed URL) as an actual FILE via the OS
 * share sheet — not as a link. The file is downloaded to the app cache first, then
 * handed to expo-sharing. Falls back to sharing the URL (React Native `Share`) if
 * the OS share service is unavailable or the download fails, so the action never
 * dead-ends. No backend involvement — the signed URL already resolves to the file.
 */
export async function shareRemoteFile(
  url: string,
  opts: { filename: string; mimeType?: string; dialogTitle?: string }
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      await Share.share({ message: url, url });
      return;
    }
    const target = `${FileSystem.cacheDirectory ?? ""}${filenameFor(url, opts.filename)}`;
    const { uri } = await FileSystem.downloadAsync(url, target);
    await Sharing.shareAsync(uri, {
      mimeType: opts.mimeType,
      dialogTitle: opts.dialogTitle,
      UTI: opts.mimeType ? UTI_BY_MIME[opts.mimeType] : undefined,
    });
  } catch {
    // Last resort: share the link so the user can still reach the file.
    await Share.share({ message: url, url }).catch(() => {});
  }
}
