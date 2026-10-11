export interface PullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  draft: boolean;
  state: "open" | "closed";
  mergedAt: string | null;
  updatedAt: string;
}

export interface Candidate extends PullRequest {
  screenshots: string[];
}

export interface Attachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface DigestItem {
  prNumber: number;
  text: string;
}

export interface DigestPlan {
  intro: string;
  items: DigestItem[];
  closing: string;
}
