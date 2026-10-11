import type { Attachment } from "./types";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Download a pull request screenshot so it can be re-uploaded to Discord.
 *
 * Attachment links redirect to signed URLs that expire in minutes, so linking
 * them would break. Anything that is not a supported image under the size
 * limit, or that fails to download, is dropped: one bad image never stops the
 * digest.
 */
export async function downloadImage(
  fetchFn: typeof fetch,
  url: string,
  filename: string,
): Promise<Attachment | null> {
  try {
    const response = await fetchFn(url, { redirect: "follow" });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const extension = EXTENSIONS[contentType];
    if (!extension) return null;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { filename: `${filename}.${extension}`, contentType, bytes };
  } catch {
    return null;
  }
}
