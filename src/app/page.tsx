"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

type Streak = {
  x: number;
  y: number;
  len: number;
  spd: number;
  w: number;
  a: number;
  phase: number;
};

type Dust = {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function usePrefersReducedMotion() {
  const ref = useRef(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => (ref.current = !!mql.matches);
    update();
    // @ts-ignore
    mql.addEventListener ? mql.addEventListener("change", update) : mql.addListener(update);
    return () => {
      // @ts-ignore
      mql.removeEventListener ? mql.removeEventListener("change", update) : mql.removeListener(update);
    };
  }, []);
  return ref;
}

function ArcaneBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 1;
    let h = 1;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    let streaks: Streak[] = [];
    let dust: Dust[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };

      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));

      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const lineCount = clamp(Math.floor((w * h) / 52000), 10, 22);
      const dustCount = clamp(Math.floor((w * h) / 14000), 90, 190);

      streaks = Array.from({ length: lineCount }).map((_, i) => ({
        x: rand(-w * 0.2, w * 1.2),
        y: rand(-h * 0.2, h * 1.2),
        len: rand(w * 0.18, w * 0.45),
        spd: rand(0.08, 0.22),
        w: rand(0.8, 1.6),
        a: rand(0.05, 0.12),
        phase: rand(0, Math.PI * 2) + i,
      }));

      dust = Array.from({ length: dustCount }).map((_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.9, 2.2),
        a: rand(0.08, 0.32),
        tw: rand(0.004, 0.02) + (i % 7) * 0.001,
      }));
    };

    resize();

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];

        const drift = reducedMotion.current ? 0 : s.spd;
        s.x += drift * 1.8;
        s.y += drift * 0.9;

        const pad = 180;
        if (s.x > w + pad) s.x = -pad;
        if (s.y > h + pad) s.y = -pad;

        const sway = reducedMotion.current ? 0 : Math.sin(t * 0.006 + s.phase) * 12;
        const x1 = s.x + sway;
        const y1 = s.y;
        const x2 = x1 + s.len;
        const y2 = y1 + s.len * 0.18;

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(168,85,247,${s.a})`);
        grad.addColorStop(0.55, `rgba(34,197,94,${s.a * 0.85})`);
        grad.addColorStop(1, `rgba(255,255,255,${s.a * 0.10})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      for (let i = 0; i < dust.length; i++) {
        const p = dust[i];

        if (!reducedMotion.current) {
          p.y -= 0.06;
          if (p.y < -40) p.y = h + 40;
        }

        const tw = reducedMotion.current ? 0.9 : 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * p.tw + i));
        const alpha = p.a * tw;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 10);
        g.addColorStop(0, `rgba(255,255,255,${alpha * 0.18})`);
        g.addColorStop(0.35, `rgba(168,85,247,${alpha * 0.12})`);
        g.addColorStop(0.7, `rgba(34,197,94,${alpha * 0.10})`);
        g.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      if (!reducedMotion.current) t += 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 700px at 18% 22%, rgba(168,85,247,0.22), rgba(0,0,0,0) 60%)," +
            "radial-gradient(900px 700px at 82% 30%, rgba(34,197,94,0.18), rgba(0,0,0,0) 60%)," +
            "radial-gradient(1000px 850px at 52% 95%, rgba(255,255,255,0.05), rgba(0,0,0,0) 70%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.95))",
        }}
      />

      <div className="absolute inset-0 opacity-[0.95]">
        <ArcaneBackground />
      </div>

      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,0.90)" }} />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-start justify-between px-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-12 w-12 rounded-full bg-white/5 ring-1 ring-white/10" />
          <div>
            <div className="text-4xl font-bold text-white/95">Hex or Hoax</div>
            <div className="text-lg text-white/60">UGAHacks Demo</div>
          </div>
        </div>

        <Link
          href="/resources"
          className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 backdrop-blur hover:bg-white/10"
        >
          Resources
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[86vh] w-full max-w-6xl items-center px-6 pb-8 pt-10">
        <div className="grid w-full gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              <span className="text-white/95">Break the illusion.</span>
              <br />
              <span className="bg-gradient-to-r from-violet-300 via-white/90 to-emerald-200 bg-clip-text text-transparent">
                Spot scams
              </span>{" "}
              <span className="text-white/85">before they</span>
              <br />
              <span className="text-white/85">cost</span>{" "}
              <span className="bg-gradient-to-r from-violet-300 via-white/90 to-emerald-200 bg-clip-text text-transparent">
                you.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-[11px] leading-relaxed text-white/70 sm:text-[13px]">
              Get an Illusion score, attack type, risky phrases highlighted, and a safe reply you can send.
            </p>

            <div className="mt-4 inline-flex rounded-2xl bg-white/5 px-6 py-3 text-sm text-white/70 ring-1 ring-white/10 backdrop-blur">
              No sign-in • Fast demo flow
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              Paste a text message, email (work or personal), or social post.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur">
                <div className="text-sm font-semibold text-white/90">Illusion %</div>
                <div className="mt-1 text-sm text-white/60">How likely is it a scam</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur">
                <div className="text-sm font-semibold text-white/90">Attack Type</div>
                <div className="mt-1 text-sm text-white/60">Phishing, Pretexting, BEC</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur">
                <div className="text-sm font-semibold text-white/90">Safe Reply</div>
                <div className="mt-1 text-sm text-white/60">Polite, firm, zero-risk response</div>
              </div>
            </div>
          </div>

          <div className="lg:pt-10">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-8 backdrop-blur">
              <div className="text-base font-semibold text-white/90">What it checks</div>
              <ul className="mt-5 space-y-3 text-sm text-white/70 sm:text-base">
                <li>• Urgency + fear tactics</li>
                <li>• Authority impersonation</li>
                <li>• Credential/OTP theft</li>
                <li>• Payment hooks (gift cards, wire, crypto)</li>
                <li>• Links + suspicious domains</li>
                <li>• Work-email specific steps (report to IT)</li>
              </ul>

              <div className="mt-7">
                <Link
                  href="/analyze"
                  className="block w-full rounded-2xl bg-white px-6 py-4 text-center text-sm font-semibold text-black hover:brightness-105"
                >
                  Start Analyzing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-8">
        <div className="text-xs text-white/55">
          Contact:{" "}
          <a className="text-white/75 underline underline-offset-4 hover:text-white" href="mailto:hexorhoax.team@gmail.com">
            hexorhoax.team@gmail.com
          </a>
        </div>
      </footer>
    </main>
  );
}
