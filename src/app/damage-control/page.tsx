export default function DamageControlPage() {
    return (
      <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1000px 800px at 15% 20%, rgba(168,85,247,0.28), rgba(0,0,0,0) 62%)," +
              "radial-gradient(1000px 800px at 85% 25%, rgba(34,197,94,0.22), rgba(0,0,0,0) 62%)," +
              "radial-gradient(900px 700px at 50% 92%, rgba(255,255,255,0.05), rgba(0,0,0,0) 70%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 240px rgba(0,0,0,0.92)" }} />
  
        <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
            <div className="text-sm font-semibold text-white/70">Hex or Hoax</div>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white/95">Damage Control</h1>
  
            <p className="mt-4 text-white/75">
              Coming soon. This page will guide you through <span className="font-semibold text-white/90">immediate actions</span> based on what happened
              (clicked a link, sent money, shared OTP, downloaded a file, etc.) and your{" "}
              <span className="font-semibold text-white/90">location</span> — with the right organizations and reporting paths.
            </p>
  
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Catered steps by situation (OTP shared, card paid, link clicked, etc.)",
                "Location-aware reporting (police, FTC/IC3 equivalents, campus/IT)",
                "Account recovery checklist (email, bank, socials)",
                "Template scripts to call banks / freeze credit",
              ].map((t) => (
                <div key={t} className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75">
                  • {t}
                </div>
              ))}
            </div>
  
            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="/analyze"
                className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:brightness-105"
              >
                Back to Analyzer
              </a>
  
              <a
                href="/"
                className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/10"
              >
                Home
              </a>
            </div>
          </div>
  
          <div className="mt-6 text-center text-xs text-white/45">
            Built for UGAHacks • Hex-or-Hoax
          </div>
        </div>
      </main>
    );
  }
  