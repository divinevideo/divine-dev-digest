import type { Attachment } from "./types";

/**
 * Post one message to a Discord webhook. Mentions are always disabled, so
 * text copied from a pull request can never ping anyone.
 */
export async function postMessage(
  fetchFn: typeof fetch,
  webhookUrl: string,
  text: string,
  attachments: Attachment[],
): Promise<void> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: text, allowed_mentions: { parse: [] } }));
  attachments.forEach((attachment, index) => {
    form.append(
      `files[${index}]`,
      new File([attachment.bytes], attachment.filename, { type: attachment.contentType }),
    );
  });
  const response = await fetchFn(webhookUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Discord webhook failed with ${response.status}`);
}
