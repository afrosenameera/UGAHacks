import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const BodySchema = z.object({
  kind: z.enum(["text", "email", "social"]).default("text"),
  text: z.string().min(5),
});

const AnalyzeSchema = z.object({
  risk_score: z.number().min(0).max(100),
  verdict: z.enum(["harmless", "suspicious", "dangerous"]),
  tactics: z.array(
    z.object({
      name: z.string(),
      confidence: z.number().min(0).max(100),
      evidence: z.array(z.string()).default([]),
      explanation: z.string(),
    })
  ),
  suspicious_spans: z.array(
    z.object({
      start: z.number().min(0),
      end: z.number().min(0),
      label: z.string(),
      reason: z.string(),
    })
  ),
  extracted: z.object({
    urls: z.array(z.string()),
    phone_numbers: z.array(z.string()),
    emails: z.array(z.string()),
  }),
  next_steps: z.array(z.string()),
  safe_reply: z.string(),
  summary: z.string(),
});

function verdictFromScore(score: number) {
  if (score >= 70) return "dangerous";
  if (score >= 35) return "suspicious";
  return "harmless";
}

function findSpans(
  text: string,
  phrases: Array<{ label: string; phrase: string; reason: string }>
) {
  const lower = text.toLowerCase();
  const spans: Array<{ start: number; end: number; label: string; reason: string }> = [];

  for (const p of phrases) {
    const needle = p.phrase.toLowerCase();
    let idx = 0;

    while (true) {
      const found = lower.indexOf(needle, idx);
      if (found === -1) break;

      spans.push({
        start: found,
        end: found + needle.length,
        label: p.label,
        reason: p.reason,
      });

      idx = found + needle.length;
      if (spans.length >= 25) return spans;
    }
  }
  return spans;
}

function extractSignals(text: string) {
  const urlRegex =
    /(https?:\/\/[^\s)]+)|(\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s)]+)|(\bbit\.ly\/[^\s)]+)/gi;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phoneRegex =
    /(\+?\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

  const urls = Array.from(text.matchAll(urlRegex)).map((m) => m[0]).slice(0, 30);
  const emails = Array.from(text.matchAll(emailRegex)).map((m) => m[0]).slice(0, 30);
  const phone_numbers = Array.from(text.matchAll(phoneRegex)).map((m) => m[0]).slice(0, 30);

  const lower = text.toLowerCase();
  const has = (s: string) => lower.includes(s);

  const urgencyHits = ["act now", "urgent", "immediately", "within 24 hours", "final notice", "asap"].filter(has);
  const fearHits = ["legal action", "account suspended", "locked", "security alert", "warrant", "police"].filter(has);
  const authorityHits = ["irs", "bank", "support", "microsoft", "apple", "payroll", "hr", "ceo"].filter(has);
  const moneyHits = ["gift card", "wire", "bitcoin", "crypto", "payment", "invoice", "refund", "owe"].filter(has);
  const otpHits = ["verification code", "otp", "2fa", "send the code", "code we sent"].filter(has);
  const rewardHits = ["winner", "free", "bonus", "claim", "prize", "reward"].filter(has);

  let score = 0;
  if (urls.length) score += 18;
  if (urls.some((u) => u.toLowerCase().includes("bit.ly") || u.toLowerCase().includes("tinyurl"))) score += 10;
  if (moneyHits.length) score += 18;
  if (otpHits.length) score += 22;
  if (urgencyHits.length) score += 12;
  if (fearHits.length) score += 12;
  if (authorityHits.length) score += 8;
  if (rewardHits.length) score += 10;
  score = Math.min(100, score);

  const tactics: Array<{ name: string; confidence: number; explanation: string; evidence: string[] }> = [];
  if (urgencyHits.length) tactics.push({ name: "Urgency", confidence: 80, explanation: "Pressure to act quickly reduces careful thinking.", evidence: urgencyHits.slice(0, 3) });
  if (fearHits.length) tactics.push({ name: "Fear", confidence: 80, explanation: "Threat language pushes panic decisions.", evidence: fearHits.slice(0, 3) });
  if (authorityHits.length) tactics.push({ name: "Authority", confidence: 70, explanation: "Impersonation of trusted roles/orgs increases compliance.", evidence: authorityHits.slice(0, 3) });
  if (moneyHits.length) tactics.push({ name: "Money Hook", confidence: 80, explanation: "Payment/refund themes are common scam patterns.", evidence: moneyHits.slice(0, 3) });
  if (otpHits.length) tactics.push({ name: "Code Theft", confidence: 90, explanation: "Asking for verification codes is a major red flag.", evidence: otpHits.slice(0, 3) });
  if (rewardHits.length) tactics.push({ name: "Reward Bait", confidence: 70, explanation: "Prizes/free offers lure clicks and data sharing.", evidence: rewardHits.slice(0, 3) });

  const spanPhrases = [
    { label: "Urgency", phrase: "urgent", reason: "High-pressure wording." },
    { label: "Urgency", phrase: "immediately", reason: "Pushes fast action." },
    { label: "Urgency", phrase: "within 24 hours", reason: "Artificial deadline." },
    { label: "Authority", phrase: "hr", reason: "Impersonation of an authority." },
    { label: "Authority", phrase: "bank", reason: "Impersonation of a trusted org." },
    { label: "Authority", phrase: "irs", reason: "Common authority-scam pattern." },
    { label: "Tech Trick", phrase: "verification code", reason: "Code theft red flag." },
    { label: "Tech Trick", phrase: "otp", reason: "Never share one-time codes." },
    { label: "Reward", phrase: "winner", reason: "Prize bait." },
    { label: "Reward", phrase: "claim", reason: "Bait wording to drive action." },
  ];

  const suspicious_spans = findSpans(text, spanPhrases);

  return {
    urls,
    emails,
    phone_numbers,
    heuristic_score: score,
    heuristic_tactics: tactics,
    suspicious_spans,
  };
}

function buildPrompt(kind: string, text: string) {
  return `
Return ONLY valid JSON matching this schema:
{
  "risk_score": number 0-100,
  "verdict": "harmless"|"suspicious"|"dangerous",
  "tactics": [{ "name": string, "confidence": 0-100, "evidence": [string], "explanation": string }],
  "suspicious_spans": [{ "start": int, "end": int, "label": string, "reason": string }],
  "extracted": { "urls": [string], "phone_numbers": [string], "emails": [string] },
  "next_steps": [string],
  "safe_reply": string,
  "summary": string
}

Rules:
- suspicious_spans MUST index into the EXACT original text.
- Keep evidence snippets short.
- safe_reply must NOT include clicking links or sharing codes.
- If benign, keep risk_score low and explain why.

Content type: ${kind}
TEXT (do not modify):
"""${text}"""
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const signals = extractSignals(body.text);

    const fallback = {
      risk_score: signals.heuristic_score,
      verdict: verdictFromScore(signals.heuristic_score),
      tactics: signals.heuristic_tactics.length
        ? signals.heuristic_tactics.map((t) => ({ ...t }))
        : [{ name: "Low Signal", confidence: 60, evidence: [], explanation: "No strong scam markers detected." }],
      suspicious_spans: signals.suspicious_spans,
      extracted: {
        urls: signals.urls,
        phone_numbers: signals.phone_numbers,
        emails: signals.emails,
      },
      next_steps:
        signals.heuristic_score >= 35
          ? [
              "Do not click links or download attachments.",
              "Verify the sender using an official website/app (not the message).",
              "If it claims to be a company, contact support through official channels.",
              "Never share passwords, verification codes, or banking details.",
              "Report as spam/phishing in your email/SMS app.",
            ]
          : ["If unsure, verify the sender through an official channel before acting."],
      safe_reply:
        signals.heuristic_score >= 35
          ? "Hi — I can’t act on this message. I’ll verify through official channels. Please don’t send links or codes."
          : "Thanks — I’ll verify this independently before taking any action.",
      summary:
        signals.heuristic_score >= 35
          ? "This message shows common scam patterns and should be treated with caution."
          : "This message has low scam indicators based on quick checks.",
    };

    if (!client) return NextResponse.json(fallback);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a cautious security analyst." },
        { role: "user", content: buildPrompt(body.kind, body.text) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const a = raw.indexOf("{");
      const b = raw.lastIndexOf("}");
      if (a >= 0 && b > a) parsed = JSON.parse(raw.slice(a, b + 1));
      else return NextResponse.json(fallback);
    }

    const ai = AnalyzeSchema.parse(parsed);

    // Blend scores for reliability
    const blended = Math.round(0.55 * ai.risk_score + 0.45 * signals.heuristic_score);

    const response = {
      ...ai,
      risk_score: blended,
      verdict: verdictFromScore(blended),
      extracted: {
        urls: Array.from(new Set([...ai.extracted.urls, ...signals.urls])).slice(0, 30),
        phone_numbers: Array.from(new Set([...ai.extracted.phone_numbers, ...signals.phone_numbers])).slice(0, 30),
        emails: Array.from(new Set([...ai.extracted.emails, ...signals.emails])).slice(0, 30),
      },
      // If AI didn’t provide spans, keep heuristic spans so highlighting still works
      suspicious_spans: ai.suspicious_spans?.length ? ai.suspicious_spans : signals.suspicious_spans,
    };

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 400 });
  }
}
