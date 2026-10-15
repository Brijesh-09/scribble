import { ApiError } from "@/libs/notes";

export type Share = {
  id: string;
  token: string;
  scope: "all" | "tag" | "item";
  tag: string | null;
  note_id: string | null;
  title: string;
  created_at: string;
};

async function parse(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? "Something went wrong", res.status);
  return json;
}

export async function fetchShares(): Promise<Share[]> {
  const json = await parse(await fetch("/api/shares", { cache: "no-store" }));
  return json.shares as Share[];
}

export async function createShare(input: {
  scope: Share["scope"];
  tag?: string;
  noteId?: string;
  title?: string;
}): Promise<Share> {
  const json = await parse(
    await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return json.share as Share;
}

export async function deleteShare(id: string) {
  await parse(await fetch(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

export function scopeLabel(s: Share) {
  if (s.scope === "all") return "Everything in your library";
  if (s.scope === "tag") return `Everything tagged ${s.tag}`;
  return "One item";
}

export async function copyLink(url: string) {
  await navigator.clipboard.writeText(url);
}

// opens the phone's share sheet when there is one, otherwise copies the link
export async function sendLink(url: string, title: string): Promise<"shared" | "copied" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}