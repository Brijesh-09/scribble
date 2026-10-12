import { lookup } from "node:dns/promises";
import net from "node:net";

export type Preview = { title?: string; description?: string; image?: string; site?: string };

/* ---------- tidy shared links ---------- */

const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|igsh|igshid|mc_cid|mc_eid|ref_src|ref_url|ref)$/i;

export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key)) u.searchParams.delete(key);
    }
    const host = u.hostname.replace(/^www\./, "");
    if (/(^|\.)(x|twitter)\.com$/.test(host)) {
      u.searchParams.delete("s");
      u.searchParams.delete("t");
    }
    if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/.test(host)) u.searchParams.delete("si");
    return u.toString();
  } catch {
    return raw;
  }
}

/* ---------- safe fetching ---------- */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return (
    v === "::" ||
    v === "::1" ||
    v.startsWith("::ffff:") ||
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    /^fe[89ab]/.test(v)
  );
}

async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("blocked");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("blocked");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("blocked");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("blocked");
}

async function fetchHtml(start: string): Promise<{ html: string; url: string } | null> {
  let url = new URL(start);

  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual", // follow redirects ourselves so every hop gets checked
      signal: AbortSignal.timeout(4000),
      headers: {
        "User-Agent": "ScribbleBot/1.0 (link preview)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;

    // the tags we want live in <head>, so stop reading early
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});
    return { html, url: url.toString() };
  }
  return null;
}

/* ---------- reading the page ---------- */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decode(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (m, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => (parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : m));
}

// login walls and bot checks give useless titles; ignore them
const GENERIC =
  /^(instagram|x|twitter|facebook|youtube|tiktok|threads|linkedin|log ?in|sign ?in|just a moment\.*|access denied|attention required.*|403 forbidden|404.*|x\. it.s what.s happening)$/i;

function parse(html: string, pageUrl: string): Preview {
  const metas = new Map<string, string>();
  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const content = val?.[1] ?? val?.[2];
    if (key && content && !metas.has(key)) metas.set(key, content);
  }

  const clean = (s: string | undefined, max = 200) => {
    const t = s ? decode(s).replace(/\s+/g, " ").trim() : "";
    return t ? t.slice(0, max) : undefined;
  };

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  let title = clean(metas.get("og:title") ?? metas.get("twitter:title") ?? titleTag);
  if (title && GENERIC.test(title)) title = undefined;

  const description = clean(
    metas.get("og:description") ?? metas.get("twitter:description") ?? metas.get("description"),
    300
  );

  let image: string | undefined;
  const rawImage = metas.get("og:image") ?? metas.get("twitter:image");
  if (rawImage) {
    try {
      const i = new URL(decode(rawImage), pageUrl);
      if (i.protocol === "http:" || i.protocol === "https:") image = i.toString();
    } catch {
      /* ignore a bad image URL */
    }
  }

  return { title, description, image, site: clean(metas.get("og:site_name"), 60) };
}

export async function unfurl(url: string): Promise<Preview> {
  try {
    const page = await fetchHtml(url);
    return page ? parse(page.html, page.url) : {};
  } catch {
    return {};
  }
}