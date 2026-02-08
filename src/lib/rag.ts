import kb from "@/data/scam_kb.json";

export type KbEntry = {
  id: string;
  tags: string[];
  title: string;
  risk_boost: number;
  min_risk?: number;
  why_risky: string[];
  what_to_do: string[];
  safe_reply_template: string;
};

function normalize(s: string) {
  return s.toLowerCase();
}

export function retrieveKb(text: string, kind: string, emailMode?: string, k: number = 4) {
  const t = normalize(text);

  const looksLikeEmail =
    /(^subject:)|(^from:)|(^to:)|(^date:)|(^cc:)/m.test(text) || /@/.test(text);
  const looksLikeSocial =
    /(link in bio|share before it'?s deleted|they don[’']t want you to know|repost|viral|double your money|miracle trick)/i.test(text);

  const entries = kb as KbEntry[];

  const scored = entries.map((e) => {
    let score = 0;
    for (const tag of e.tags) {
      const tagN = normalize(tag);
      if (tagN.length >= 3 && t.includes(tagN)) score += 3;
    }

    // Strong boost for: Email selected but obviously social/viral
    if (e.id === "format_not_email" && kind === "email" && !looksLikeEmail && looksLikeSocial) {
      score += 12;
    }

    // Slight bias for work email context
    if (emailMode === "work" && e.id === "ceo_gift_cards") score += 1;

    return { entry: e, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.entry);
}

export function kbRiskBoost(entries: KbEntry[]) {
  return entries.reduce((sum, e) => sum + (e.risk_boost || 0), 0);
}

export function kbMinRisk(entries: KbEntry[]) {
  return entries.reduce((m, e) => Math.max(m, e.min_risk ?? 0), 0);
}
