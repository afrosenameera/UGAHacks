"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Kind = "text" | "email" | "social" | "deepfake";
type EmailMode = "personal" | "work";

type ApiResp = {
  risk_score: number;
  verdict: "harmless" | "suspicious" | "dangerous";
  tactics: Array<{ name: string; confidence: number; evidence: string[]; explanation: string }>;
  suspicious_spans: Array<{ start: number; end: number; label: string; reason: string }>;
  extracted: { urls: string[]; phone_numbers: string[]; emails: string[] };
  attack_types: Array<{ tag: string; confidence: number; rationale: string }>;
  next_steps: string[];
  safe_reply: string;
  summary: string;
};

type NewsItem = { title: string; link: string; pubDate: string; source: string };
type HistoryItem = { id: string; ts: number; kind: Kind; emailMode?: EmailMode; preview: string; risk?: number };

const ATTACK_DEFS: Record<string, string> = {
  phishing: "Phishing tricks you into clicking a link or sharing sensitive information by impersonating a trusted source.",
  pretexting: "Pretexting is a fake story (a ‘pretext’) used to gain trust and extract information or actions.",
  "BEC / CEO fraud": "Business Email Compromise (BEC) impersonates an exec/vendor to push urgent payments or sensitive actions.",
  "credential harvesting": "Credential harvesting steals usernames/passwords via fake login pages or verification prompts.",
  "code theft": "Code theft asks for OTP/MFA/verification codes to take over accounts.",
  "malware lure": "A malware lure uses attachments/links to deliver malicious files or downloads.",
  "misinformation / engagement bait": "Engagement bait pressures sharing using emotional/urgent language and vague claims.",
};

const COMING_SOON_DEEPFAKE =
  "Coming soon: Deepfake detection 🧿\n\nSoon you’ll be able to paste a link or upload media metadata and we’ll help verify authenticity, detect manipulation signals, and suggest safe verification steps.";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function verdictLabel(v: ApiResp["verdict"]) {
  if (v === "dangerous") return "Dangerous";
  if (v === "suspicious") return "Suspicious";
  return "Probably Safe";
}

function verdictChipClass(v: ApiResp["verdict"]) {
  if (v === "dangerous") return "bg-red-500/15 text-red-200 ring-1 ring-red-400/25";
  if (v === "suspicious") return "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-400/25";
  return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25";
}

function DashedMenuIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 hover:bg-white/10">
      <div className="flex flex-col gap-1">
        <div className="h-[2px] w-5 border-t-2 border-dashed border-white/70" />
        <div className="h-[2px] w-5 border-t-2 border-dashed border-white/55" />
        <div className="h-[2px] w-5 border-t-2 border-dashed border-white/40" />
      </div>
    </div>
  );
}

function HighlightedText({ text, spans }: { text: string; spans: ApiResp["suspicious_spans"] }) {
  const safeSpans = [...(spans ?? [])]
    .filter((s) => s.start >= 0 && s.end > s.start && s.end <= text.length)
    .sort((a, b) => a.start - b.start)
    .slice(0, 40);

  if (!safeSpans.length) return <div className="whitespace-pre-wrap text-[15px] text-white/80">{text}</div>;

  const pieces: Array<{ t: string; s?: ApiResp["suspicious_spans"][number] }> = [];
  let cursor = 0;

  for (const s of safeSpans) {
    if (s.start > cursor) pieces.push({ t: text.slice(cursor, s.start) });
    pieces.push({ t: text.slice(s.start, s.end), s });
    cursor = s.end;
  }
  if (cursor < text.length) pieces.push({ t: text.slice(cursor) });

  return (
    <TooltipProvider>
      <div className="whitespace-pre-wrap text-[15px] text-white/80">
        {pieces.map((p, idx) =>
          p.s ? (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <span className="rounded-md bg-white/10 px-1 py-0.5 text-white/95 ring-1 ring-white/10">{p.t}</span>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                <div className="font-semibold">{p.s.label}</div>
                <div className="mt-1 max-w-[260px] text-white/80">{p.s.reason}</div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span key={idx}>{p.t}</span>
          )
        )}
      </div>
    </TooltipProvider>
  );
}

function SpinnerGauge({ value, verdict }: { value: number; verdict: ApiResp["verdict"] }) {
  const v = clamp(value, 0, 100);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24">
        <div className="spin-ring absolute inset-0 rounded-full" />
        <div className="absolute inset-[6px] rounded-full bg-black/70 ring-1 ring-white/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-semibold">{v}</div>
            <div className="text-[11px] text-white/60">Illusion</div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[13px] text-white/60">Illusion Strength</div>
        <div className="mt-1 text-lg font-semibold">
          {v}/100 • {verdictLabel(verdict)}
        </div>
        <div className={cn("mt-2 inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold", verdictChipClass(verdict))}>
          {verdict.toUpperCase()}
        </div>
      </div>

      <style jsx global>{`
        @keyframes ringSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .spin-ring {
          background: conic-gradient(
            rgba(168, 85, 247, 0.9),
            rgba(168, 85, 247, 0.15),
            rgba(34, 197, 94, 0.9),
            rgba(34, 197, 94, 0.15),
            rgba(168, 85, 247, 0.9)
          );
          animation: ringSpin 1.8s linear infinite;
          box-shadow: 0 0 26px rgba(168, 85, 247, 0.14), 0 0 26px rgba(34, 197, 94, 0.12);
        }
      `}</style>
    </div>
  );
}

const DEMOS: Record<string, { kind: Kind; emailMode?: EmailMode; text: string }> = {
  "CEO Gift Cards": {
    kind: "email",
    emailMode: "work",
    text:
      "From: CEO <ceo.company@gmail.com>\nSubject: Quick favor\n\nHey, are you free? I need you to buy 6 Apple gift cards right now and send me the codes. This is urgent and confidential.\n\nThanks,\nCEO",
  },
  "Bank Lockout": {
    kind: "text",
    text: "Security Alert: Your bank account will be locked in 30 minutes. Verify immediately at bit.ly/verify-now to avoid suspension.",
  },
  "Viral Claim": {
    kind: "social",
    text: "BREAKING: They don’t want you to know this! Share before it's deleted. This miracle trick will DOUBLE your money overnight. Link in bio.",
  },
};

// ---- Email format checker (UI-only) ----
function analyzeEmailFormat(raw: string) {
  const t = (raw ?? "").trim();

  const hasHeaderSubject = /(^|\n)\s*subject\s*:/i.test(t);
  const hasHeaderFrom = /(^|\n)\s*from\s*:/i.test(t);
  const hasHeaderTo = /(^|\n)\s*to\s*:/i.test(t);
  const hasHeaderDate = /(^|\n)\s*date\s*:/i.test(t);

  const hasEmailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t);

  const hasGreeting =
    /(^|\n)\s*(hi|hello|dear|hey)\b/i.test(t) ||
    /(^|\n)\s*good (morning|afternoon|evening)\b/i.test(t);

  const hasSignature =
    /(^|\n)\s*(thanks|thank you|regards|sincerely|best|respectfully)\b/i.test(t);

  const headerScore = [hasHeaderSubject, hasHeaderFrom, hasHeaderTo, hasHeaderDate].filter(Boolean).length;

  const looksLikeEmail =
    headerScore >= 1 ||
    (hasGreeting && (hasSignature || hasEmailAddress)) ||
    (hasEmailAddress && hasSignature);

  const missingGreetingOrSubject = !(hasGreeting && (hasHeaderSubject || hasHeaderFrom || hasEmailAddress));

  return {
    looksLikeEmail,
    missingGreetingOrSubject,
  };
}

export default function Analyzer() {
  const [kind, setKind] = useState<Kind>("email");
  const [emailMode, setEmailMode] = useState<EmailMode>("personal");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ---- Email format gate state ----
  const [emailCheck, setEmailCheck] = useState<null | { needsDecision: boolean; message: string }>(null);
  const [buzz, setBuzz] = useState(false);

  const headerBadge = useMemo(() => {
    if (!resp) return { label: "WAITING", cls: "bg-white/5 text-white/70 ring-1 ring-white/10" };
    if (resp.verdict === "dangerous") return { label: "DANGEROUS", cls: "bg-red-500/15 text-red-200 ring-1 ring-red-400/25" };
    if (resp.verdict === "suspicious") return { label: "SUSPICIOUS", cls: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-400/25" };
    return { label: "SAFE", cls: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25" };
  }, [resp]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hex_history");
      if (!raw) return;
      const parsed = JSON.parse(raw) as HistoryItem[];
      if (Array.isArray(parsed)) setHistory(parsed.slice(0, 12));
    } catch {}
  }, []);

  const saveHistory = (item: HistoryItem) => {
    const next = [item, ...history].slice(0, 12);
    setHistory(next);
    try {
      localStorage.setItem("hex_history", JSON.stringify(next));
    } catch {}
  };

  const loadHistoryItem = (h: HistoryItem) => {
    setKind(h.kind);
    if (h.kind === "email" && h.emailMode) setEmailMode(h.emailMode);
    setText(h.preview);
    setResp(null);
    setErr(null);
    setNews([]);
    setDrawerOpen(false);
    setEmailCheck(null);
    setBuzz(false);
  };

  const fetchNews = async (analysis: ApiResp) => {
    try {
      setNewsLoading(true);
      setNews([]);
      const topAttack = analysis.attack_types?.[0]?.tag ?? "";
      const q = `${topAttack} ${analysis.summary ?? ""}`.trim().slice(0, 140);
      if (!q) return;
      const res = await fetch(`/api/news?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setNews(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const goDamageControl = () => {
    window.location.href = "/damage-control";
  };

  const doEmailCheck = () => {
    const r = analyzeEmailFormat(text);

    if (!r.looksLikeEmail || r.missingGreetingOrSubject) {
      setEmailCheck({
        needsDecision: true,
        message:
          "This doesn’t look like a typical email (missing Subject/headers or a greeting). Switch to Text/Social for best accuracy — or choose Analyze Anyway.",
      });
      setBuzz(true);
      window.setTimeout(() => setBuzz(false), 520);
      return;
    }

    setEmailCheck({ needsDecision: false, message: "Email format looks good. You can proceed." });
    setBuzz(false);
  };

  const resolveEmailDecision = (action: "text" | "social" | "anyway") => {
    if (action === "anyway") {
      setEmailCheck({ needsDecision: false, message: "Okay — analyzing as Email anyway." });
      setBuzz(false);
      setErr(null);
      return;
    }

    // Switch type
    setKind(action);
    setEmailCheck(null);
    setBuzz(false);
    setErr(null);
    setResp(null);
    setNews([]);
  };

  const run = async () => {
    if (kind === "deepfake") {
      setErr("Deepfake detection is coming soon.");
      return;
    }

    // If Email + warning not resolved, block run
    if (kind === "email" && emailCheck?.needsDecision) {
      setErr("Please choose: switch to Text/Social or Analyze Anyway.");
      setBuzz(true);
      window.setTimeout(() => setBuzz(false), 520);
      return;
    }

    setErr(null);
    setLoading(true);
    setResp(null);
    setNews([]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          text,
          emailMode: kind === "email" ? emailMode : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Request failed");

      setResp(json);
      fetchNews(json);

      saveHistory({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ts: Date.now(),
        kind,
        emailMode: kind === "email" ? emailMode : undefined,
        preview: text.trim().slice(0, 320),
        risk: json?.risk_score ?? undefined,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const injectDemo = (name: keyof typeof DEMOS) => {
    const d = DEMOS[name];
    setKind(d.kind);
    if (d.kind === "email" && d.emailMode) setEmailMode(d.emailMode);
    setText(d.text);
    setResp(null);
    setErr(null);
    setNews([]);
    setEmailCheck(null);
    setBuzz(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-[15px]">
      {/* ✅ VISIBLE purple + green background for THIS page */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(1200px 900px at 10% 20%, rgba(168,85,247,0.42), rgba(0,0,0,0) 60%)," +
            "radial-gradient(1200px 900px at 90% 25%, rgba(34,197,94,0.36), rgba(0,0,0,0) 60%)," +
            "radial-gradient(1200px 900px at 50% 90%, rgba(255,255,255,0.05), rgba(0,0,0,0) 70%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.86), rgba(0,0,0,0.97))",
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-0" style={{ boxShadow: "inset 0 0 260px rgba(0,0,0,0.92)" }} />

      {/* ✅ Footer pill (single) */}
      <div className="fixed bottom-5 right-5 z-40">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-[13px] text-white/80 backdrop-blur">
          <a href="mailto:hexorhoax.team@gmail.com" className="hover:text-white hover:underline underline-offset-4">
            Contact
          </a>
          <span className="text-white/35">•</span>
          <Link href="/about" className="hover:text-white hover:underline underline-offset-4">
            About
          </Link>
          <span className="text-white/35">•</span>
          <Link href="/analyze" className="hover:text-white hover:underline underline-offset-4">
            Analyze
          </Link>
        </div>
      </div>

      {/* ✅ All content above background */}
      <div className="relative z-10">
        {/* HISTORY DRAWER */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[320px] border-r border-white/10 bg-neutral-950/95 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-white/90">History</div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-xl bg-white/5 px-3 py-2 text-[13px] text-white/80 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 text-[13px] text-white/55">Recently analyzed (local only).</div>

              <div className="mt-4 space-y-2">
                {history.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[14px] text-white/70">
                    No history yet. Run Shatter Illusion.
                  </div>
                ) : (
                  history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => loadHistoryItem(h)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-white/85">
                          {h.kind.toUpperCase()}
                          {h.kind === "email" ? ` • ${h.emailMode ?? "personal"}` : ""}
                        </div>
                        {typeof h.risk === "number" ? <div className="text-[12px] text-white/60">{h.risk}/100</div> : null}
                      </div>
                      <div className="mt-2 line-clamp-3 text-[13px] text-white/65">{h.preview}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TOP BAR */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} aria-label="Open history">
              <DashedMenuIcon />
            </button>

            <div>
              <div className="text-2xl font-extrabold tracking-tight text-white/95 sm:text-3xl">Hex or Hoax</div>
              <div className="mt-1 text-[13px] text-white/55">
                Paste a message → Illusion %, attack type, cursed phrases, and a counterspell.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(DEMOS).map((k) => (
              <button
                key={k}
                onClick={() => injectDemo(k as any)}
                className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-black ring-1 ring-white/10 hover:brightness-105"
              >
                Demo: {k}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT */}
          <div id="input" className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white/90">Summon the Message</div>
                <div className="mt-1 text-[13px] text-white/60">Choose type → paste → shatter illusion.</div>
              </div>

              {/* Tabs + Buzz wrapper */}
              <div className={cn("flex gap-2", buzz ? "hex-buzz" : "")}>
                {(["text", "email", "social", "deepfake"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setKind(k);
                      setResp(null);
                      setErr(null);
                      setNews([]);
                      setEmailCheck(null);
                      setBuzz(false);
                      if (k === "deepfake") setText(COMING_SOON_DEEPFAKE);
                    }}
                    className={cn(
                      "rounded-xl px-3 py-2 text-[13px] ring-1 transition",
                      kind === k ? "bg-white text-black ring-white/10" : "bg-white/5 text-white/80 ring-white/10 hover:bg-white/10"
                    )}
                  >
                    {k === "text" ? "Text" : k === "email" ? "Email" : k === "social" ? "Social" : "Deepfake"}
                  </button>
                ))}
              </div>
            </div>

            {kind === "email" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-[13px] text-white/60">Email type</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEmailMode("personal")}
                        className={cn(
                          "rounded-xl px-3 py-2 text-[13px] ring-1 transition",
                          emailMode === "personal" ? "bg-white text-black ring-white/10" : "bg-white/5 text-white/80 ring-white/10 hover:bg-white/10"
                        )}
                      >
                        Personal
                      </button>
                      <button
                        onClick={() => setEmailMode("work")}
                        className={cn(
                          "rounded-xl px-3 py-2 text-[13px] ring-1 transition",
                          emailMode === "work" ? "bg-white text-black ring-white/10" : "bg-white/5 text-white/80 ring-white/10 hover:bg-white/10"
                        )}
                      >
                        Work
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={doEmailCheck}
                    className="rounded-xl bg-white/5 px-3 py-2 text-[13px] font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Check Email Format
                  </button>
                </div>

                {emailCheck && (
                  <div
                    className={cn(
                      "rounded-2xl border p-4 text-[13px] backdrop-blur",
                      emailCheck.needsDecision
                        ? "border-yellow-400/25 bg-yellow-500/10 text-yellow-100"
                        : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                    )}
                  >
                    <div className="font-semibold">{emailCheck.needsDecision ? "Email format warning" : "Email format check"}</div>
                    <div className="mt-1 text-white/80">{emailCheck.message}</div>

                    {emailCheck.needsDecision && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => resolveEmailDecision("text")}
                          className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-black ring-1 ring-white/10 hover:brightness-105"
                        >
                          Switch to Text
                        </button>
                        <button
                          onClick={() => resolveEmailDecision("social")}
                          className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-black ring-1 ring-white/10 hover:brightness-105"
                        >
                          Switch to Social
                        </button>
                        <button
                          onClick={() => resolveEmailDecision("anyway")}
                          className="rounded-xl bg-white/5 px-3 py-2 text-[13px] font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/10"
                        >
                          Analyze Anyway
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (kind === "email" && emailCheck?.needsDecision) {
                  setEmailCheck({
                    needsDecision: true,
                    message: "Text changed. Please re-check email format, or choose Analyze Anyway / switch type.",
                  });
                }
              }}
              placeholder="Paste or type here…"
              className="mt-4 h-72 w-full resize-none rounded-2xl border border-white/10 bg-black/25 p-4 text-[15px] text-white/90 outline-none ring-1 ring-white/5 placeholder:text-white/35 focus:ring-white/15"
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                onClick={run}
                disabled={loading || text.trim().length < 3 || kind === "deepfake"}
                className={cn(
                  "rounded-2xl px-5 py-3 text-[14px] font-semibold ring-1 transition",
                  loading || text.trim().length < 3 || kind === "deepfake"
                    ? "bg-white/10 text-white/50 ring-white/10"
                    : "bg-gradient-to-r from-violet-200/90 via-white/80 to-emerald-200/90 text-black ring-white/10 hover:brightness-105"
                )}
              >
                {loading ? "Shattering..." : kind === "deepfake" ? "Deepfake: Coming Soon" : "Shatter Illusion"}
              </button>

              <div className="text-[13px] text-white/50">Drafts stay per tab.</div>
            </div>

            {err && (
              <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-[13px] text-red-200">
                {err}
              </div>
            )}

            {/* Related News */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold text-white/85">Related News</div>
                {newsLoading && <div className="text-[12px] text-white/50">Fetching…</div>}
              </div>

              {!newsLoading && news.length === 0 ? (
                <div className="mt-2 text-[14px] text-white/55">Run Shatter Illusion to fetch related incidents.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {news.slice(0, 5).map((n, i) => (
                    <a
                      key={i}
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                    >
                      <div className="text-[14px] font-semibold text-white/85">{n.title}</div>
                      <div className="mt-1 text-[12px] text-white/60">
                        {n.source ? `${n.source} • ` : ""}
                        {n.pubDate}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white/90">Spell Diagnosis</div>
                <div className="mt-1 text-[13px] text-white/60">
                  Illusion → Attack → Cursed → Retentions → Steps → Counterspell
                </div>
              </div>
              <div className={cn("rounded-full px-3 py-1 text-[12px] font-semibold", headerBadge.cls)}>{headerBadge.label}</div>
            </div>

            {!resp ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-[14px] text-white/65">
                Run <span className="font-semibold text-white/85">Shatter Illusion</span> or a Demo to see results.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <SpinnerGauge value={resp.risk_score} verdict={resp.verdict} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">Attack Type</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(resp.attack_types ?? []).slice(0, 6).map((a, i) => {
                      const def =
                        ATTACK_DEFS[a.tag] ||
                        ATTACK_DEFS[a.tag.toLowerCase()] ||
                        "A recognized social-engineering pattern used by attackers.";
                      return (
                        <TooltipProvider key={i}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="cursor-help rounded-full bg-white/5 px-3 py-2 text-[13px] text-white/85 ring-1 ring-white/10 hover:bg-white/10">
                                {a.tag} • {Math.round(a.confidence)}%
                              </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={10}>
                              <div className="text-sm font-semibold">{a.tag}</div>
                              <div className="mt-1 max-w-[320px] text-[12px] text-white/80">{def}</div>
                              <div className="mt-2 max-w-[320px] text-[11px] text-white/60">Why detected: {a.rationale}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">Cursed phrases</div>
                  <div className="mt-3">
                    <HighlightedText text={text} spans={resp.suspicious_spans ?? []} />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">Retentions</div>
                  <div className="mt-2 text-[14px] text-white/75">{resp.summary}</div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(resp.tactics ?? []).slice(0, 6).map((t, i) => (
                      <div key={i} className="rounded-md border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[14px] font-semibold">{t.name}</div>
                          <div className="text-[12px] text-white/60">{Math.round(t.confidence)}%</div>
                        </div>
                        <div className="mt-1 text-[13px] text-white/70">{t.explanation}</div>
                        {t.evidence?.length ? (
                          <div className="mt-2 text-[12px] text-white/60">
                            Evidence: <span className="text-white/75">{t.evidence.join(" • ")}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">Next steps</div>
                  <ul className="mt-3 space-y-2 text-[14px] text-white/75">
                    {(resp.next_steps ?? []).slice(0, 10).map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>

                {/* DAMAGE CONTROL CTA */}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">If you already clicked / replied</div>
                  <div className="mt-2 text-[14px] text-white/75">Don’t panic. Quick, practical steps can reduce harm fast.</div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={goDamageControl}
                      className="rounded-2xl bg-white px-5 py-3 text-[14px] font-semibold text-black ring-1 ring-white/10 hover:brightness-105"
                    >
                      Damage Control →
                    </button>

                    <div className="text-[13px] text-white/55">
                      Immediate actions to take (location + situation based) — coming soon.
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-[13px] font-semibold text-white/85">Counterspell</div>
                  <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3 text-[14px] text-white/85">
                    {resp.safe_reply}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Buzz animation */}
      <style jsx global>{`
        @keyframes hexBuzz {
          0% {
            transform: translateX(0);
          }
          15% {
            transform: translateX(-3px);
          }
          30% {
            transform: translateX(3px);
          }
          45% {
            transform: translateX(-2px);
          }
          60% {
            transform: translateX(2px);
          }
          75% {
            transform: translateX(-1px);
          }
          90% {
            transform: translateX(1px);
          }
          100% {
            transform: translateX(0);
          }
        }
        .hex-buzz {
          animation: hexBuzz 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
