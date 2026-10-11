import type { Attachment } from "./types";

/**
 * Post one message to a Discord webhook. Mentions are always disabled, so
 * text copied from a pull request can never ping anyone.
 */
const MAX_ATTEMPTS = 3;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function postMessage(
  fetchFn: typeof fetch,
  webhookUrl: string,
  text: string,
  attachments: Attachment[],
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetchFn(webhookUrl, { method: "POST", body: buildForm(text, attachments) });
    if (response.ok) return;
    // Webhooks allow about 5 messages per 2 seconds; a daily run can send 7.
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000));
      continue;
    }
    throw new Error(`Discord webhook failed with ${response.status}`);
  }
}

function buildForm(text: string, attachments: Attachment[]): FormData {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: text, allowed_mentions: { parse: [] } }));
  attachments.forEach((attachment, index) => {
    form.append(
      `files[${index}]`,
      new File([attachment.bytes], attachment.filename, { type: attachment.contentType }),
    );
  });
  return form;
}
