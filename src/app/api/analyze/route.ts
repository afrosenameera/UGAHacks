import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { retrieveKb, kbRiskBoost, kbMinRisk } from "@/lib/rag";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const BodySchema = z.object({
  kind: z.enum(["text", "email", "social"]).default("text"),
  text: z.string().min(3),
  emailMode: z.enum(["personal", "work"]).optional(),
  senderEmail: z.string().optional(),
});

const AnalyzeSchema = z.object({
  risk_score: z.number().min(0).max(100),
  verdict: z.enum(["harmless", "suspicious", "dangerous"]),
  tactics: z
    .array(
      z.object({
        name: z.string(),
        confidence: z.number().min(0).max(100),
        evidence: z.array(z.string()).default([]),
        explanation: z.string(),
      })
    )
    .default([]),
  suspicious_spans: z
    .array(
      z.object({
        start: z.number().int(),
        end: z.number().int(),
        label: z.string(),
        reason: z.string(),
      })
    )
    .default([]),
  extracted: z
    .object({
      urls: z.array(z.string()).default([]),
      phone_numbers: z.array(z.string()).default([]),
      emails: z.array(z.string()).default([]),
    })
    .default({ urls: [], phone_numbers: [], emails: [] }),
  attack_types: z
    .array(
      z.object({
        tag: z.string(),
        confidence: z.number().min(0).max(100),
        rationale: z.string(),
      })
    )
    .default([]),
  next_steps: z.array(z.string()).default([]),
  safe_reply: z.string().default(""),
  summary: z.string().default(""),
});

function verdictFromScore(score: number) {
  if (score >= 70) return "dangerous";
  if (score >= 35) return "suspicious";
  return "harmless";
}

function findSpans(text: string, phrases: Array<{ label: string; phrase: string; reason: string }>) {
  const lower = text.toLowerCase();
  const spans: Array<{ start: number; end: number; label: string; reason: string }> = [];

  for (const p of phrases) {
    const needle = p.phrase.toLowerCase();
    let idx = 0;
    while (true) {
      const found = lower.indexOf(needle, idx);
      if (found === -1) break;

      spans.push({ start: found, end: found + needle.length, label: p.label, reason: p.reason });
      idx = found + needle.length;
      if (spans.length >= 40) return spans;
    }
  }
  return spans;
}

function extractSignals(text: string) {
  const urlRegex =
    /(https?:\/\/[^\s)]+)|(\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s)]+)?)|(\bbit\.ly\/[^\s)]+)/gi;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phoneRegex = /(\+?\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

  const urls = Array.from(text.matchAll(urlRegex)).map((m) => m[0]).slice(0, 40);
  const emails = Array.from(text.matchAll(emailRegex)).map((m) => m[0]).slice(0, 40);
  const phone_numbers = Array.from(text.matchAll(phoneRegex)).map((m) => m[0]).slice(0, 40);

  const lower = text.toLowerCase();
  const has = (s: string) => lower.includes(s);

  const urgencyHits = ["act now", "urgent", "immediately", "within 24 hours", "final notice", "asap", "last chance"].filter(has);
  const fearHits = ["legal action", "account suspended", "locked", "security alert", "warrant", "police", "breach"].filter(has);
  const authorityHits = ["irs", "bank", "support", "microsoft", "apple", "payroll", "hr", "ceo", "admin", "it team"].filter(has);
  const moneyHits = ["gift card", "wire", "bitcoin", "crypto", "payment", "invoice", "refund", "owe", "transfer"].filter(has);
  const otpHits = ["verification code", "otp", "2fa", "send the code", "one-time code", "code we sent"].filter(has);
  const rewardHits = ["winner", "free", "bonus", "claim", "prize", "reward"].filter(has);
  const credHits = ["password", "login", "sign in", "reset", "verify your account", "confirm your identity"].filter(has);
  const attachmentHits = ["attachment", "invoice attached", "open the file", ".zip", ".html", ".iso", ".exe", ".docm"].filter(has);

  // Stronger viral / social bait detection
  const viralHits = [
    "share before it's deleted",
    "share before it’s deleted",
    "they don’t want you to know",
    "they don't want you to know",
    "link in bio",
    "repost",
    "share now",
    "before it's removed",
    "before it’s removed",
  ].filter(has);

  const getRichHits = ["double your money", "guaranteed returns", "overnight", "miracle trick", "get rich quick"].filter(has);

  let score = 0;
  if (urls.length) score += 16;
  if (urls.some((u) => /bit\.ly|tinyurl|t\.co/i.test(u))) score += 10;
  if (moneyHits.length) score += 16;
  if (otpHits.length) score += 26;           // stronger
  if (credHits.length) score += 18;          // stronger
  if (urgencyHits.length) score += 10;
  if (fearHits.length) score += 10;
  if (authorityHits.length) score += 7;
  if (rewardHits.length) score += 10;
  if (attachmentHits.length) score += 10;

  // viral/get-rich
  if (viralHits.length) score += 22;         // stronger
  if (getRichHits.length) score += 22;       // stronger

  score = Math.min(100, score);

  const tactics: Array<{ name: string; confidence: number; explanation: string; evidence: string[] }> = [];

  if (urgencyHits.length) tactics.push({ name: "Urgency", confidence: 80, explanation: "Deadlines and pressure reduce careful checking.", evidence: urgencyHits.slice(0, 3) });
  if (fearHits.length) tactics.push({ name: "Fear", confidence: 78, explanation: "Threat language pushes panic decisions.", evidence: fearHits.slice(0, 3) });
  if (authorityHits.length) tactics.push({ name: "Authority", confidence: 72, explanation: "Impersonation of trusted roles/orgs increases compliance.", evidence: authorityHits.slice(0, 3) });
  if (moneyHits.length) tactics.push({ name: "Financial Hook", confidence: 82, explanation: "Payment/refund/gift card themes are common scam patterns.", evidence: moneyHits.slice(0, 3) });
  if (otpHits.length) tactics.push({ name: "Code Theft", confidence: 92, explanation: "Requests for OTP/MFA codes are a major takeover indicator.", evidence: otpHits.slice(0, 3) });
  if (credHits.length) tactics.push({ name: "Credential Harvest", confidence: 86, explanation: "Attempts to steal logins via fake verification/reset.", evidence: credHits.slice(0, 3) });
  if (attachmentHits.length) tactics.push({ name: "Attachment Lure", confidence: 75, explanation: "Attachments are a common malware delivery method.", evidence: attachmentHits.slice(0, 3) });

  if (viralHits.length) tactics.push({ name: "Virality / Engagement Bait", confidence: 85, explanation: "Uses viral language to pressure sharing without verification.", evidence: viralHits.slice(0, 3) });
  if (getRichHits.length) tactics.push({ name: "Too-Good-To-Be-True Money Claim", confidence: 88, explanation: "Promises fast/guaranteed money — a common fraud pattern.", evidence: getRichHits.slice(0, 3) });

  if (!tactics.length) tactics.push({ name: "Low Signal", confidence: 60, explanation: "No strong scam markers detected.", evidence: [] });

  const spanPhrases = [
    { label: "Urgency", phrase: "urgent", reason: "High-pressure wording." },
    { label: "Urgency", phrase: "immediately", reason: "Pushes fast action." },
    { label: "Authority", phrase: "bank", reason: "Impersonation of a trusted org." },
    { label: "Authority", phrase: "irs", reason: "Common authority-scam pattern." },
    { label: "Tech Trick", phrase: "verification code", reason: "Never share one-time codes." },
    { label: "Tech Trick", phrase: "otp", reason: "One-time codes enable takeovers." },
    { label: "Viral", phrase: "link in bio", reason: "Common social bait phrase." },
    { label: "Viral", phrase: "share before it's deleted", reason: "Virality pressure tactic." },
    { label: "Money Claim", phrase: "double your money", reason: "Too-good-to-be-true money promise." },
  ];

  const suspicious_spans = findSpans(text, spanPhrases);

  return { urls, emails, phone_numbers, heuristic_score: score, heuristic_tactics: tactics, suspicious_spans };
}

function buildAttackTypesHeuristic(kind: string, text: string, urls: string[]) {
  const hasCred = /\b(password|login|sign in|verify your account|reset|confirm your identity)\b/i.test(text);
  const hasOtp = /\b(otp|verification code|one-time code|2fa|mfa|code we sent)\b/i.test(text);
  const hasMoney = /\b(gift card|wire|bank transfer|invoice|payment|crypto|bitcoin)\b/i.test(text);
  const hasImpersonation = /\b(hr|payroll|it|helpdesk|admin|ceo|cfo|finance|bank|support)\b/i.test(text);
  const hasAttachment = /\b(attachment|\.zip|\.html|\.iso|\.exe|\.docm)\b/i.test(text);
  const hasVirality = /\b(link in bio|share before it'?s deleted|they don[’']t want you to know|repost|share now|viral)\b/i.test(text);
  const hasGetRich = /\b(double your money|guaranteed returns|overnight|miracle trick|get rich quick)\b/i.test(text);

  const tags: Array<{ tag: string; confidence: number; rationale: string }> = [];

  if (kind === "email" || kind === "text") {
    if (hasCred || hasOtp || urls.length) tags.push({ tag: "phishing", confidence: Math.min(95, 55 + (hasOtp ? 30 : 0) + (hasCred ? 20 : 0) + (urls.length ? 10 : 0)), rationale: "Tries to get you to click/login/share secrets." });
    if (hasImpersonation) tags.push({ tag: "pretexting", confidence: 80, rationale: "Pretends to be a trusted role/org to make you comply." });
    if (hasMoney && hasImpersonation) tags.push({ tag: "BEC / CEO fraud", confidence: 85, rationale: "Authority + payment request pattern." });
    if (hasAttachment) tags.push({ tag: "malware lure", confidence: 75, rationale: "Attachment-driven delivery is a common malware vector." });
    if (hasOtp) tags.push({ tag: "code theft", confidence: 90, rationale: "Requests for OTP/MFA codes are a major takeover indicator." });
    if (hasCred) tags.push({ tag: "credential harvesting", confidence: 84, rationale: "Attempts to capture logins via fake verification/reset." });
    if (hasVirality || hasGetRich) tags.push({ tag: "spam / engagement bait", confidence: 85, rationale: "Viral bait / get-rich-quick content is high-risk spam." });
  }

  if (kind === "social") {
    if (hasVirality) tags.push({ tag: "misinformation / engagement bait", confidence: 85, rationale: "Uses virality pressure and vague claims to drive shares." });
    if (hasGetRich) tags.push({ tag: "investment fraud / get-rich-quick", confidence: 84, rationale: "Promises of quick money are common fraud patterns." });
  }

  const map = new Map<string, { tag: string; confidence: number; rationale: string }>();
  for (const t of tags) {
    const prev = map.get(t.tag);
    if (!prev || t.confidence > prev.confidence) map.set(t.tag, t);
  }
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function workEmailAdvice() {
  return [
    "Do not click links or open attachments from this email.",
    "Verify via an official channel (company directory/known number/official portal) — not by replying.",
    "Never share passwords, MFA/OTP codes, or approve unexpected sign-in prompts.",
    "Report it to your security/IT team using the phishing report button or a ticket.",
    "If you already clicked, change passwords via the official portal and notify IT immediately."
  ];
}

function personalEmailAdvice() {
  return [
    "Don’t click links or download files from the message.",
    "Open the official app/site directly to verify (don’t use the message link).",
    "Never share OTP codes, passwords, or banking information.",
    "Block/report the sender as spam/phishing."
  ];
}

function buildPrompt(kind: string, emailMode: string | undefined, kindMismatch: boolean, kbContext: any, text: string) {
  return `
Return ONLY valid JSON with:
{
 "risk_score": 0-100,
 "verdict": "harmless"|"suspicious"|"dangerous",
 "tactics": [{ "name": string, "confidence": 0-100, "evidence": [string], "explanation": string }],
 "suspicious_spans": [{ "start": int, "end": int, "label": string, "reason": string }],
 "extracted": { "urls": [string], "phone_numbers": [string], "emails": [string] },
 "attack_types": [{"tag": string, "confidence": 0-100, "rationale": string}],
 "next_steps": [string],
 "safe_reply": string,
 "summary": string
}

Rules:
- suspicious_spans MUST index into the EXACT original text.
- Keep evidence snippets short.
- safe_reply must NOT include clicking links or sharing codes.
- If kindMismatch is true (Email selected but content is not email-like), explicitly say it doesn't look like an email and recommend switching to Text/Social.

Context: kind=${kind}, emailMode=${emailMode ?? "n/a"}, kindMismatch=${kindMismatch}

RAG_KB_CONTEXT (use this to improve accuracy; do not invent facts):
${JSON.stringify(kbContext).slice(0, 3500)}

TEXT (do not modify):
"""${text}"""
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // detect Email tab mismatch
    const looksLikeEmail =
      /(^subject:)|(^from:)|(^to:)|(^date:)|(^cc:)/m.test(body.text) || /@/.test(body.text);
    const looksLikeSocial =
      /(link in bio|share before it'?s deleted|they don[’']t want you to know|repost|viral|double your money|miracle trick)/i.test(body.text);
    const kindMismatch = body.kind === "email" && !looksLikeEmail && looksLikeSocial;

    const signals = extractSignals(body.text);
    const attackTypesHeuristic = buildAttackTypesHeuristic(body.kind, body.text, signals.urls);

    // RAG retrieval
    const kbHits = retrieveKb(body.text, body.kind, body.emailMode);
    const ragBoost = kbRiskBoost(kbHits);
    const ragMinRisk = kbMinRisk(kbHits);

    const kbContext = kbHits.map((e) => ({
      id: e.id,
      title: e.title,
      why_risky: e.why_risky,
      what_to_do: e.what_to_do,
      safe_reply_template: e.safe_reply_template,
      risk_boost: e.risk_boost,
      min_risk: e.min_risk ?? 0
    }));

    // Fallback if no OpenAI key
    let fallbackScore = signals.heuristic_score;

    // RAG nudge (small but meaningful)
    fallbackScore = Math.min(100, fallbackScore + Math.min(25, Math.round(ragBoost / 3)));

    // enforce minimum risk if KB says so
    if (ragMinRisk) fallbackScore = Math.max(fallbackScore, ragMinRisk);

    // enforce mismatch minimum
    if (kindMismatch) fallbackScore = Math.max(fallbackScore, 70);

    const fallback = {
      risk_score: fallbackScore,
      verdict: verdictFromScore(fallbackScore),
      tactics: signals.heuristic_tactics,
      suspicious_spans: signals.suspicious_spans,
      extracted: { urls: signals.urls, phone_numbers: signals.phone_numbers, emails: signals.emails },
      attack_types: attackTypesHeuristic,
      next_steps: kindMismatch
        ? [
            "This doesn’t look like an email — switch to Social (or Text) tab for accurate analysis.",
            "Do not reshare. Virality pressure is a manipulation tactic.",
            "Avoid ‘link in bio’/short links; verify with trusted sources.",
            "Report/block the account if it pushes money or secrecy."
          ]
        : body.kind === "email"
        ? body.emailMode === "work"
          ? workEmailAdvice()
          : personalEmailAdvice()
        : body.kind === "social"
        ? ["Don’t reshare immediately — verify via reliable sources.", "Watch for engagement bait language.", "Report impersonation/scam content."]
        : ["Don’t click links or share codes.", "Verify via official app/site.", "Block/report if suspicious."],
      safe_reply:
        kbHits[0]?.safe_reply_template ||
        (body.kind === "email"
          ? body.emailMode === "work"
            ? "I can’t act on this request. I’ll verify through official company channels before doing anything."
            : "I can’t act on this request. I’ll verify through the official website/app."
          : "I can’t act on this. I’ll verify through official channels first."),
      summary: kindMismatch
        ? "This doesn’t look like an email — it reads like a viral/social post (engagement bait + unrealistic money claims). Treat as high-risk spam."
        : fallbackScore >= 35
        ? "This message shows common scam patterns and should be treated with caution."
        : "This message has low scam indicators based on quick checks.",
    };

    if (!client) return NextResponse.json(fallback);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a cautious security analyst. Be specific and practical." },
        { role: "user", content: buildPrompt(body.kind, body.emailMode, kindMismatch, kbContext, body.text) }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const ai = AnalyzeSchema.parse(parsed);

    // Blend heuristic + AI + RAG boost
    let blended = Math.round(0.55 * ai.risk_score + 0.45 * signals.heuristic_score);

    // Add RAG boost (cap)
    blended = Math.min(100, blended + Math.min(25, Math.round(ragBoost / 3)));

    // enforce KB minimum risk
    if (ragMinRisk) blended = Math.max(blended, ragMinRisk);

    // enforce mismatch minimum
    if (kindMismatch) blended = Math.max(blended, 70);

    // Ensure mismatch is mentioned
    let summary = ai.summary;
    if (kindMismatch && !summary.toLowerCase().includes("doesn’t look like an email") && !summary.toLowerCase().includes("doesn't look like an email")) {
      summary = `This doesn’t look like an email format. ${summary}`;
    }

    // Prefer KB safe reply if any
    const safe_reply = kbHits[0]?.safe_reply_template || ai.safe_reply;

    return NextResponse.json({
      ...ai,
      risk_score: blended,
      verdict: verdictFromScore(blended),
      summary,
      safe_reply,
      extracted: {
        urls: Array.from(new Set([...(ai.extracted.urls ?? []), ...signals.urls])).slice(0, 40),
        phone_numbers: Array.from(new Set([...(ai.extracted.phone_numbers ?? []), ...signals.phone_numbers])).slice(0, 40),
        emails: Array.from(new Set([...(ai.extracted.emails ?? []), ...signals.emails])).slice(0, 40)
      },
      suspicious_spans: ai.suspicious_spans?.length ? ai.suspicious_spans : signals.suspicious_spans,
      attack_types: (ai.attack_types?.length ? ai.attack_types : attackTypesHeuristic).slice(0, 6),
      next_steps: kindMismatch
        ? [
            "This doesn’t look like an email — switch to Social (or Text) tab for accurate analysis.",
            "Do not reshare. Virality pressure is a manipulation tactic.",
            "Avoid ‘link in bio’/short links; verify with trusted sources.",
            "Report/block the account if it pushes money or secrecy.",
            ...(ai.next_steps ?? [])
          ].slice(0, 10)
        : (ai.next_steps ?? fallback.next_steps).slice(0, 10),
      // Optional: expose KB hits to UI if you want
      // kb_hits: kbContext,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 400 });
  }
}
