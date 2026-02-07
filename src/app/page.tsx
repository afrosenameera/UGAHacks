"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

type AnalyzeResponse = {
  risk_score: number;
  verdict: "harmless" | "suspicious" | "dangerous";
  tactics: Array<{ name: string; confidence: number; evidence: string[]; explanation: string }>;
  suspicious_spans: Array<{ start: number; end: number; label: string; reason: string }>;
  extracted: { urls: string[]; phone_numbers: string[]; emails: string[] };
  next_steps: string[];
  safe_reply: string;
  summary: string;
};

type HistoryItem = {
  id: string;
  ts: number;
  kind: "text" | "email" | "social";
  text: string;
  risk_score: number;
  verdict: "harmless" | "suspicious" | "dangerous";
  summary: string;
};

const presets = {
  text: `USPS: Your package is on hold due to an address issue. Confirm within 12 hours to avoid return. https://bit.ly/3xAMPLE`,
  email: `Subject: Urgent Payroll Update Required

Hi, this is HR. We noticed your direct deposit is failing. Reply with your full name and the 6-digit verification code we just sent to update your account immediately.`,
  social: `BREAKING: They are hiding the truth. Share this NOW before it’s deleted. Click here to see the leaked proof: example.com/leak`,
};

const demoSpells: Array<{ label: string; kind: "text" | "email" | "social"; text: string }> = [
  {
    label: "CEO Gift Cards",
    kind: "email",
    text: `Subject: Quick favor (urgent)

Hey — I’m in meetings. Need you to buy 6 gift cards ASAP and send the codes. Keep this confidential. Reply when done.`,
  },
  {
    label: "Bank Lockout",
    kind: "text",
    text: `BANK ALERT: Your account will be locked in 30 minutes. Verify immediately: https://bit.ly/lock-verify`,
  },
  {
    label: "Viral Claim",
    kind: "social",
    text: `BREAKING: This video proves it all. Share NOW before it’s deleted. Click to see the leaked evidence: example.com/leak`,
  },
];

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function scoreLabel(score: number) {
  if (score >= 80) return "Cursed (High Risk)";
  if (score >= 60) return "Very Suspicious";
  if (score >= 35) return "Suspicious";
  if (score >= 15) return "Mildly Weird";
  return "Probably Safe";
}

function highlightText(
  text: string,
  spans: Array<{ start: number; end: number; label: string; reason: string }>
) {
  if (!spans?.length) return <span className="text-white">{text}</span>;

  const sorted = [...spans]
    .filter((s) => s.start >= 0 && s.end <= text.length && s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const merged: typeof sorted = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (!last || s.start >= last.end) merged.push(s);
    else if (s.end > last.end) merged[merged.length - 1] = { ...last, end: s.end };
  }

  const parts: Array<{ t: string; tag?: string; reason?: string }> = [];
  let idx = 0;
  for (const s of merged) {
    if (s.start > idx) parts.push({ t: text.slice(idx, s.start) });
    parts.push({ t: text.slice(s.start, s.end), tag: s.label, reason: s.reason });
    idx = s.end;
  }
  if (idx < text.length) parts.push({ t: text.slice(idx) });

  const pill =
    "px-1 py-[1px] rounded bg-gradient-to-r from-fuchsia-500/25 via-cyan-400/20 to-amber-300/20 ring-1 ring-white/10";

  return (
    <span className="text-white">
      {parts.map((p, i) =>
        p.tag ? (
          <span
            key={i}
            title={`${p.tag}: ${p.reason}`}
            className={`${pill} underline decoration-2 underline-offset-4 decoration-white/90`}
          >
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </span>
  );
}

function Orb({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const ring = `conic-gradient(
    rgba(217,70,239,0.95) 0%,
    rgba(34,211,238,0.95) ${Math.max(12, pct * 0.6)}%,
    rgba(253,224,71,0.95) ${pct}%,
    rgba(255,255,255,0.12) ${pct}% 100%
  )`;

  return (
    <div className="relative h-28 w-28">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: ring }}
        animate={{ rotate: -360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[10px] rounded-full bg-neutral-950 border border-white/10" />
      <motion.div
        className="absolute inset-[12px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(34,211,238,0.28), rgba(217,70,239,0.14) 45%, rgba(253,224,71,0.08) 60%, rgba(0,0,0,0) 75%)",
        }}
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-white">{score}</div>
          <div className="text-xs text-white/80">Illusion</div>
        </div>
      </div>
    </div>
  );
}

function Sparks({ enabled }: { enabled: boolean }) {
  const [sparks, setSparks] = useState<
    Array<{ id: number; left: number; top: number; size: number; dur: number; delay: number; drift: number; hue: number }>
  >([]);

  useEffect(() => {
    if (!enabled) return;
    const arr = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 2 + Math.random() * 3,
      dur: 4 + Math.random() * 6,
      delay: Math.random() * 2,
      drift: 18 + Math.random() * 45,
      hue: [285, 190, 48][i % 3],
    }));
    setSparks(arr);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: 0.42,
            background: `hsl(${s.hue} 90% 70%)`,
            filter: "blur(0.2px)",
          }}
          animate={{ y: [0, -s.drift], opacity: [0.12, 0.70, 0.16] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  const [kind, setKind] = useState<"text" | "email" | "social">("text");
  const [text, setText] = useState(presets.text);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const score = data?.risk_score ?? 0;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hex_history");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("hex_history", JSON.stringify(history.slice(0, 10)));
    } catch {}
  }, [history]);

  function loadPreset(k: "text" | "email" | "social") {
    setKind(k);
    setText(presets[k]);
    setData(null);
    setError(null);
  }

  async function analyze(payload?: { kind: "text" | "email" | "social"; text: string }) {
    setLoading(true);
    setError(null);
    setData(null);

    const p = payload ?? { kind, text };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Request failed");

      setKind(p.kind);
      setText(p.text);
      setData(json);

      const item: HistoryItem = {
        id: uid(),
        ts: Date.now(),
        kind: p.kind,
        text: p.text,
        risk_score: json.risk_score,
        verdict: json.verdict,
        summary: json.summary,
      };
      setHistory((h) => [item, ...h].slice(0, 10));
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      {/* Color aura background (safe, not huge strings) */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 650px at 12% 18%, rgba(217,70,239,0.32), rgba(0,0,0,0) 60%)," +
            "radial-gradient(900px 650px at 88% 24%, rgba(34,211,238,0.26), rgba(0,0,0,0) 62%)," +
            "radial-gradient(900px 650px at 52% 92%, rgba(253,224,71,0.16), rgba(0,0,0,0) 65%)",
        }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 180px rgba(0,0,0,0.86)" }} />
      <Sparks enabled={mounted} />

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                <span className="text-lg">🧙</span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                <span className="bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-amber-200 bg-clip-text text-transparent">
                  Hex or Hoax
                </span>
              </h1>
              <Badge className="border border-white/15 text-white bg-white/5">UGAHacks Demo</Badge>
            </div>
            <p className="text-white/80">
              Paste a message → get a risk score, highlighted “tells”, and a safe reply.
            </p>
          </div>

          {/* Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {demoSpells.map((d) => (
              <Button
                key={d.label}
                variant="secondary"
                size="sm"
                onClick={() => analyze(d)}
                className="border border-white/15 bg-white text-black hover:bg-white/90"
              >
                Demo: {d.label}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
              title="History"
            >
              ⋮
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left */}
          <Card className="bg-black/35 border-white/10 backdrop-blur text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Summon the Message</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => loadPreset("text")}>
                    Text
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => loadPreset("email")}>
                    Email
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => loadPreset("social")}>
                    Social
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
                <TabsList className="bg-black/40 border border-white/10 text-white">
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                  <TabsTrigger value="social">Social</TabsTrigger>
                </TabsList>

                <TabsContent value={kind} className="mt-3">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[320px] bg-black/40 border-white/10 text-white placeholder:text-white/60"
                    placeholder="Paste the message here…"
                  />
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="text-black bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-amber-200 hover:opacity-90"
                  onClick={() => analyze()}
                  disabled={loading}
                >
                  {loading ? "Casting…" : "Shatter Illusion 🪄"}
                </Button>

                {error ? <div className="text-sm text-white">Error: {error}</div> : null}
              </div>

              <Separator className="bg-white/10" />

              {/* Mobile controls */}
              <div className="md:hidden flex flex-wrap gap-2">
                {demoSpells.map((d) => (
                  <Button
                    key={d.label}
                    variant="secondary"
                    size="sm"
                    onClick={() => analyze(d)}
                    className="border border-white/15 bg-white text-black hover:bg-white/90"
                  >
                    Demo: {d.label}
                  </Button>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setHistoryOpen(true)}
                  className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
                >
                  ⋮ History
                </Button>
              </div>

              <div className="text-sm text-white/80">
                Demo buttons auto-run analysis so judging is smooth.
              </div>
            </CardContent>
          </Card>

          {/* Right */}
          <Card className="bg-black/35 border-white/10 backdrop-blur text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Spell Diagnosis</span>
                <Badge className="border border-white/15 text-white bg-white/5">
                  {data ? data.verdict.toUpperCase() : "WAITING"}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="space-y-1">
                  <div className="text-sm text-white/80">Illusion Strength</div>
                  <div className="text-lg font-semibold">
                    {score}/100 · {scoreLabel(score)}
                  </div>
                  <div className="mt-2 w-[260px] max-w-full">
                    <Progress value={score} />
                  </div>
                </div>
                <Orb score={score} />
              </div>

              <AnimatePresence mode="wait">
                {!data ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-white/10 bg-black/40 p-4"
                  >
                    {loading ? "Shattering illusion…" : "Run Shatter Illusion or a Demo to see results."}
                  </motion.div>
                ) : (
                  <motion.div
                    key="data"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-sm mb-2 text-white/80">Cursed Phrases (highlighted)</div>
                      <div className="leading-relaxed">{highlightText(text, data.suspicious_spans)}</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-sm mb-2 text-white/80">Summary</div>
                      <div>{data.summary}</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {data.tactics.slice(0, 4).map((t) => (
                        <div key={t.name} className="rounded-xl border border-white/10 bg-black/40 p-4">
                          <div className="flex items-center justify-between">
                            <div className="font-medium uppercase tracking-wide">
                              <span className="bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-amber-200 bg-clip-text text-transparent">
                                {t.name}
                              </span>
                            </div>
                            <Badge className="bg-white/5 border-white/15 text-white">{t.confidence}%</Badge>
                          </div>
                          <div className="text-sm text-white/85 mt-2">{t.explanation}</div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white/80">What to do next</div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyText(data.next_steps.join("\n"))}
                          className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
                        >
                          Copy
                        </Button>
                      </div>
                      <ul className="mt-3 list-disc pl-5 space-y-1">
                        {data.next_steps.slice(0, 6).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white/80">Counterspell (safe reply)</div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyText(data.safe_reply)}
                          className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap">{data.safe_reply}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {historyOpen ? (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setHistoryOpen(false)} />
            <motion.div
              className="absolute right-4 top-4 w-[92vw] max-w-md rounded-2xl border border-white/10 bg-black/75 backdrop-blur p-4"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/85">Session History</div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setHistory([])}
                    className="border border-white/15 bg-white/10 text-white hover:bg-white/15"
                  >
                    Clear
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setHistoryOpen(false)}
                    className="border border-white/15 bg-white text-black hover:bg-white/90"
                  >
                    Close
                  </Button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="mt-3 text-sm text-white/75">No scans yet.</div>
              ) : (
                <div className="mt-3 max-h-[60vh] overflow-auto space-y-2 pr-1">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setKind(h.kind);
                        setText(h.text);
                        setData(null);
                        setError(null);
                        setHistoryOpen(false);
                      }}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white">
                          <span className="font-semibold">{h.kind.toUpperCase()}</span> · {h.risk_score}/100 ·{" "}
                          {h.verdict.toUpperCase()}
                        </div>
                        <div className="text-xs text-white/60">
                          {mounted ? new Date(h.ts).toLocaleTimeString() : ""}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/75 line-clamp-2">{h.summary}</div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
