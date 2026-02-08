import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const BodySchema = z.object({
  kind: z.enum(["text", "email", "social"]).default("text"),
  emailMode: z.enum(["personal", "work"]).optional(),
  senderEmail: z.string().optional(),
  text: z.string().min(3),
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
  attack_types: z
    .array(
      z.object({
        tag: z.string(),
        confidence: z.number().min(0).max(100),
        rationale: z.string(),
      })
    )
    .default([]),
  sender_analysis: z
    .object({
      sender_email: z.string().default(""),
      from_header: z.string().default(""),
      reply_to: z.string().default(""),
      return_path: z.string().default(""),
      domain: z.string().default(""),
      flags: z.array(z.string()).default([]),
    })
    .default({
      sender_email: "",
      from_header: "",
      reply_to: "",
      return_path: "",
      domain: "",
      flags: [],
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

function extractSignals(text: string) {
  const urlRegex =
    /(https?:\/\/[^\s)]+)|(\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s)]+)?)|(\bbit\.ly\/[^\s)]+)/gi;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phoneRegex =
    /(\+?\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

  const urls = Array.from(text.matchAll(urlRegex)).map((m) => m[0]).slice(0, 40);
  const emails = Array.from(text.matchAll(emailRegex)).map((m) => m[0]).slice(0, 40);
  const phone_numbers = Array.from(text.matchAll(phoneRegex)).map((m) => m[0]).slice(0, 40);

  const lower = text.toLowerCase();
  const has = (s: string) => lower.includes(s);

  const urgencyHits = ["act now", "urgent", "immediately", "within 24 hours", "final notice", "asap", "last chance"].filter(has);
  const fearHits = ["legal action", "account suspended", "locked", "security alert", "warrant", "police", "breach"].filter(has);
  const authorityHits = ["irs", "bank", "support", "microsoft", "apple", "payroll", "hr", "ceo", "admin", "it team"].filter(has);
  const moneyHits = ["gift card", "wire", "bitcoin", "crypto", "payment", "invoice", "refund", "owe", "transfer"].filter(has);
  const otpHits = ["verification code", "otp", "2fa", "send the code", "one-time code"].filter(has);
  const credHits = ["password", "login", "sign in", "reset", "verify your account", "confirm your identity"].filter(has);
  const attachmentHits = ["attachment", "invoice attached", "open the file", ".zip", ".html", ".iso", ".exe", ".docm"].filter(has);

  let score = 0;
  if (urls.length) score += 16;
  if (urls.some((u) => /bit\.ly|tinyurl|t\.co/i.test(u))) score += 10;
  if (moneyHits.length) score += 16;
  if (otpHits.length) score += 22;
  if (credHits.length) score += 16;
  if (urgencyHits.length) score += 10;
  if (fearHits.length) score += 10;
  if (authorityHits.length) score += 7;
  if (attachmentHits.length) score += 10;
  score = Math.min(100, score);

  const tactics: Array<{ name: string; confidence: number; explanation: string; evidence: string[] }> = [];
  if (urgencyHits.length) tactics.push({ name: "Urgency", confidence: 80, explanation: "Deadlines and pressure reduce careful checking.", evidence: urgencyHits.slice(0, 3) });
  if (fearHits.length) tactics.push({ name: "Fear", confidence: 78, explanation: "Threat language pushes panic decisions.", evidence: fearHits.slice(0, 3) });
  if (authorityHits.length) tactics.push({ name: "Authority", confidence: 72, explanation: "Impersonation of trusted roles/orgs increases compliance.", evidence: authorityHits.slice(0, 3) });
  if (moneyHits.length) tactics.push({ name: "Financial Hook", confidence: 82, explanation: "Payment/refund/gift card themes are common scam patterns.", evidence: moneyHits.slice(0, 3) });
  if (otpHits.length) tactics.push({ name: "Code Theft", confidence: 92, explanation: "Requests for verification codes are a major red flag.", evidence: otpHits.slice(0, 3) });
  if (credHits.length) tactics.push({ name: "Credential Harvest", confidence: 86, explanation: "Attempts to steal logins are common in phishing.", evidence: credHits.slice(0, 3) });
  if (attachmentHits.length) tactics.push({ name: "Attachment Lure", confidence: 75, explanation: "Dangerous file types and ‘invoice attached’ are common malware lures.", evidence: attachmentHits.slice(0, 3) });

  return { urls, emails, phone_numbers, heuristic_score: score, heuristic_tactics: tactics };
}

function parseEmailHeaders(raw: string) {
  const lines = raw.split(/\r?\n/).slice(0, 70);
  const get = (name: string) => {
    const re = new RegExp(`^${name}:\\s*(.+)$`, "i");
    const line = lines.find((l) => re.test(l));
    if (!line) return "";
    const m = line.match(re);
    return (m?.[1] ?? "").trim();
  };

  const from = get("From");
  const replyTo = get("Reply-To");
  const returnPath = get("Return-Path");

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const fromEmail = (from.match(emailRegex)?.[0] ?? "").toLowerCase();
  const replyEmail = (replyTo.match(emailRegex)?.[0] ?? "").toLowerCase();
  const returnEmail = (returnPath.match(emailRegex)?.[0] ?? "").toLowerCase();

  return { from, replyTo, returnPath, fromEmail, replyEmail, returnEmail };
}

function domainOf(email: string) {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).toLowerCase();
}

const FREE_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
]);

function looksLikeCorporateImpersonation(text: string) {
  const lower = text.toLowerCase();
  const roleClaims = ["hr", "payroll", "it", "helpdesk", "security", "admin", "ceo", "cfo", "finance"];
  const orgClaims = ["microsoft", "google", "apple", "paypal", "amazon", "bank", "university", "support"];
  return roleClaims.some((w) => lower.includes(w)) || orgClaims.some((w) => lower.includes(w));
}

function suspiciousDomain(domain: string) {
  if (!domain) return false;
  if (domain.includes("xn--")) return true;
  const hyphens = (domain.match(/-/g) || []).length;
  if (hyphens >= 3) return true;
  if (/\b(secure|verify|login|account|support)\b/.test(domain)) return true;
  return false;
}

function urlDomains(urls: string[]) {
  const out: string[] = [];
  for (const u of urls) {
    try {
      const normalized = u.startsWith("http") ? u : `https://${u}`;
      const host = new URL(normalized).hostname.toLowerCase();
      if (host) out.push(host);
    } catch {}
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function buildAttackTypesHeuristic(kind: string, text: string, urls: string[], senderFlags: string[]) {
  const hasCred = /\b(password|login|sign in|verify your account|reset)\b/i.test(text);
  const hasOtp = /\b(otp|verification code|one-time code|2fa)\b/i.test(text);
  const hasMoney = /\b(gift card|wire|bank transfer|invoice|payment)\b/i.test(text);
  const hasImpersonation = /\b(hr|payroll|it|helpdesk|admin|ceo|cfo|finance)\b/i.test(text);
  const hasAttachment = /\b(attachment|\.zip|\.html|\.iso|\.exe|\.docm)\b/i.test(text);

  const tags: Array<{ tag: string; confidence: number; rationale: string }> = [];

  if (kind === "email" || kind === "text") {
    if (hasCred || hasOtp || urls.length) {
      tags.push({
        tag: "phishing",
        confidence: Math.min(95, 55 + (hasOtp ? 25 : 0) + (hasCred ? 20 : 0) + (urls.length ? 10 : 0)),
        rationale: "Tries to get you to click/login/share secrets.",
      });
    }
    if (hasImpersonation) {
      tags.push({
        tag: "pretexting",
        confidence: Math.min(92, 55 + (senderFlags.length ? 15 : 0)),
        rationale: "Pretends to be a trusted role to make you comply.",
      });
    }
    if (hasMoney && hasImpersonation) {
      tags.push({
        tag: "BEC / CEO fraud",
        confidence: 85,
        rationale: "Authority + urgent payment request pattern.",
      });
    }
    if (hasAttachment) {
      tags.push({
        tag: "malware lure",
        confidence: 75,
        rationale: "Attachment-driven delivery is a common malware vector.",
      });
    }
    if (hasOtp) {
      tags.push({
        tag: "code theft",
        confidence: 90,
        rationale: "Requests for OTP/MFA codes are a major takeover indicator.",
      });
    }
    if (hasCred) {
      tags.push({
        tag: "credential harvesting",
        confidence: 84,
        rationale: "Tries to capture logins via fake verification/reset.",
      });
    }
  }

  if (kind === "social") {
    if (/\bshare now|before it's deleted|before it’s deleted|they don't want you to know\b/i.test(text)) {
      tags.push({
        tag: "misinformation / engagement bait",
        confidence: 78,
        rationale: "Uses virality pressure and vague claims to drive shares.",
      });
    }
  }

  const map = new Map<string, { tag: string; confidence: number; rationale: string }>();
  for (const t of tags) {
    const prev = map.get(t.tag);
    if (!prev || t.confidence > prev.confidence) map.set(t.tag, t);
  }
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function workEmailAdvice(score: number) {
  const risky = score >= 35;
  const veryRisky = score >= 70;

  const base = [
    "Do not click links or open attachments from this email.",
    "Verify via an official channel (company directory/known number/official portal) — not by replying to the email.",
    "Never share passwords, MFA/OTP codes, or approve unexpected sign-in prompts.",
  ];

  const work = [
    "If you’re on public/home Wi-Fi, use your organization’s trusted VPN before accessing internal resources.",
    "Don’t mix work + personal accounts/devices for sensitive actions (payroll, banking, HR changes).",
    "Report it to your security/IT team using the phishing report button or a ticket, and include full headers if possible.",
    "If you already clicked, change passwords via the official portal and notify IT immediately.",
  ];

  if (veryRisky) return [...base, ...work];
  if (risky) return [...base, ...work.slice(0, 3)];
  return [base[1], work[2]];
}

function personalEmailAdvice(score: number) {
  const risky = score >= 35;
  const base = [
    "Don’t click links or download files from the message.",
    "Open the official app/site directly to verify (don’t use the message link).",
    "Never share OTP codes, passwords, or banking information.",
  ];
  if (!risky) return [base[1], "If unsure, ignore and verify independently."];
  return [...base, "Block/report the sender as spam/phishing."];
}

function buildPrompt(kind: string, emailMode: string | undefined, senderContext: any, text: string) {
  return `
Return ONLY valid JSON with:
{
  "risk_score": 0-100,
  "verdict": "harmless"|"suspicious"|"dangerous",
  "attack_types": [{"tag": string, "confidence": 0-100, "rationale": string}],
  "sender_analysis": {"sender_email": string, "from_header": string, "reply_to": string, "return_path": string, "domain": string, "flags": [string]},
  "tactics": [{"name": string, "confidence": 0-100, "evidence": [string], "explanation": string}],
  "suspicious_spans": [{"start": int, "end": int, "label": string, "reason": string}],
  "extracted": {"urls":[string],"phone_numbers":[string],"emails":[string]},
  "next_steps": [string],
  "safe_reply": string,
  "summary": string
}

Rules:
- If kind=email & emailMode=work, include workplace actions: VPN on public wifi, separate devices/accounts, report to IT, verify via trusted source.
- Attack types must include common security terms when applicable: phishing, pretexting, BEC / CEO fraud, credential harvesting, code theft, malware lure.
- suspicious_spans must index into the EXACT original text.
- safe_reply must NOT encourage clicking links or sharing codes.

Context: kind=${kind}, emailMode=${emailMode ?? "n/a"}, senderContext=${JSON.stringify(senderContext).slice(0, 1200)}

TEXT:
"""${text}"""
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const signals = extractSignals(body.text);

    const headers = body.kind === "email" ? parseEmailHeaders(body.text) : null;

    const senderEmail =
      (body.senderEmail?.toLowerCase() || "") ||
      headers?.fromEmail ||
      headers?.replyEmail ||
      "";

    const domain = domainOf(senderEmail);

    const senderFlags: string[] = [];

    if (body.kind === "email") {
      if (headers?.replyEmail && headers.replyEmail !== headers.fromEmail) {
        senderFlags.push("Reply-To mismatch (can redirect replies to attacker).");
      }
      if (headers?.returnEmail && headers.returnEmail !== headers.fromEmail) {
        senderFlags.push("Return-Path mismatch (can indicate spoofing/forwarding).");
      }
      if (domain && FREE_PROVIDERS.has(domain) && looksLikeCorporateImpersonation(body.text)) {
        senderFlags.push("Free email domain used while claiming an organization role.");
      }
      if (domain && suspiciousDomain(domain)) {
        senderFlags.push("Sender domain has lookalike characteristics.");
      }
    }

    const linkDomains = urlDomains(signals.urls);
    if (body.kind === "email" && domain && linkDomains.length) {
      const unrelated = linkDomains.filter((d) => !d.endsWith(domain));
      if (unrelated.length) senderFlags.push("Links point to domains unrelated to the sender domain.");
    }

    const attackTypesHeuristic = buildAttackTypesHeuristic(body.kind, body.text, signals.urls, senderFlags);

    const fallback = {
      risk_score: signals.heuristic_score,
      verdict: verdictFromScore(signals.heuristic_score),
      attack_types: attackTypesHeuristic,
      sender_analysis: {
        sender_email: senderEmail,
        from_header: headers?.from ?? "",
        reply_to: headers?.replyTo ?? "",
        return_path: headers?.returnPath ?? "",
        domain,
        flags: senderFlags,
      },
      tactics: signals.heuristic_tactics.length
        ? signals.heuristic_tactics
        : [{ name: "Low Signal", confidence: 60, evidence: [], explanation: "No strong scam markers detected." }],
      suspicious_spans: [],
      extracted: { urls: signals.urls, phone_numbers: signals.phone_numbers, emails: signals.emails },
      next_steps:
        body.kind === "email"
          ? body.emailMode === "work"
            ? workEmailAdvice(signals.heuristic_score)
            : personalEmailAdvice(signals.heuristic_score)
          : body.kind === "social"
          ? ["Don’t reshare immediately — verify via reliable sources.", "Check for engagement bait language.", "Report impersonation/scam content."]
          : ["Don’t click links or share codes.", "Verify via official app/site.", "Block/report if suspicious."],
      safe_reply:
        body.kind === "email"
          ? body.emailMode === "work"
            ? "I can’t act on this request. I’ll verify through official company channels before doing anything."
            : "I can’t act on this request. I’ll verify through the official website/app."
          : "I can’t do that. I’ll verify through official channels first.",
      summary:
        body.kind === "email"
          ? "This email shows patterns commonly used in scams or social engineering. Verify independently before acting."
          : "This message shows signals that can indicate deception. Verify before acting.",
    };

    if (!client) return NextResponse.json(fallback);

    const senderContext = {
      sender_email: senderEmail,
      domain,
      flags: senderFlags,
      link_domains: linkDomains,
      emailMode: body.emailMode ?? "",
      header_from: headers?.from ?? "",
      header_reply_to: headers?.replyTo ?? "",
      header_return_path: headers?.returnPath ?? "",
    };

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a cautious email security analyst. Be specific and practical." },
        { role: "user", content: buildPrompt(body.kind, body.emailMode, senderContext, body.text) },
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

    const blended = Math.round(0.55 * ai.risk_score + 0.45 * signals.heuristic_score);

    const response = {
      ...ai,
      risk_score: blended,
      verdict: verdictFromScore(blended),
      sender_analysis: {
        ...ai.sender_analysis,
        sender_email: ai.sender_analysis.sender_email || senderEmail,
        domain: ai.sender_analysis.domain || domain,
        flags: Array.from(new Set([...(ai.sender_analysis.flags ?? []), ...senderFlags])).slice(0, 12),
        from_header: ai.sender_analysis.from_header || headers?.from || "",
        reply_to: ai.sender_analysis.reply_to || headers?.replyTo || "",
        return_path: ai.sender_analysis.return_path || headers?.returnPath || "",
      },
      extracted: {
        urls: Array.from(new Set([...ai.extracted.urls, ...signals.urls])).slice(0, 40),
        phone_numbers: Array.from(new Set([...ai.extracted.phone_numbers, ...signals.phone_numbers])).slice(0, 40),
        emails: Array.from(new Set([...ai.extracted.emails, ...signals.emails])).slice(0, 40),
      },
      attack_types: (ai.attack_types?.length ? ai.attack_types : attackTypesHeuristic).slice(0, 6),
    };

    if (body.kind === "email" && body.emailMode === "work") {
      response.next_steps = Array.from(new Set([...workEmailAdvice(blended), ...response.next_steps])).slice(0, 10);
    }

    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 400 });
  }
}
