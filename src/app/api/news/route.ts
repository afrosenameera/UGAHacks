import { NextResponse } from "next/server";

function decodeHtml(s: string) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Some RSS feeds wrap content in CDATA
function stripCdata(s: string) {
  if (!s) return "";
  return s.replace(/^<!\[CDATA\[(.*)\]\]>$/, "$1").trim();
}

function firstMatch(xml: string, re: RegExp) {
  const m = re.exec(xml);
  return m?.[1] ?? "";
}

function normalizeLink(link: string) {
  link = link.trim();
  if (!link) return "";
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  return link;
}

function buildRssUrl(q: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchRss(q: string) {
  const url = buildRssUrl(q);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });

  return await res.text();
}

function parseItems(rss: string, limit = 6) {
  const chunks = rss.split(/<item>/gi).slice(1);

  const items = chunks.slice(0, limit).map((chunk) => {
    const rawTitle = firstMatch(chunk, /<title>([\s\S]*?)<\/title>/i);
    const rawLink = firstMatch(chunk, /<link>([\s\S]*?)<\/link>/i);
    const rawPub = firstMatch(chunk, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const rawSource = firstMatch(chunk, /<source[^>]*>([\s\S]*?)<\/source>/i);

    const title = decodeHtml(stripCdata(rawTitle));
    const link = normalizeLink(decodeHtml(stripCdata(rawLink)));
    const pubDate = stripCdata(rawPub).trim();
    const source = decodeHtml(stripCdata(rawSource));

    return { title, link, pubDate, source };
  });

  return items.filter((it) => it.title && it.link);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();
    if (!qRaw) return NextResponse.json({ items: [] }, { status: 200 });

    // 1) Primary query
    const rss1 = await fetchRss(qRaw);
    let items = parseItems(rss1, 6);

    // 2) Fallback query for demo reliability
    if (items.length === 0) {
      const short = qRaw.split(/\s+/).slice(0, 6).join(" ");
      const fallback = `${short} scam OR fraud OR phishing`.trim();
      const rss2 = await fetchRss(fallback);
      items = parseItems(rss2, 6);
    }

    return NextResponse.json(
      { items },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message ?? "news error" }, { status: 200 });
  }
}
