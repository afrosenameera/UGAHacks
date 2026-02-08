export default function AboutPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 700px at 18% 22%, rgba(168,85,247,0.18), rgba(0,0,0,0) 60%)," +
            "radial-gradient(900px 700px at 82% 30%, rgba(34,197,94,0.14), rgba(0,0,0,0) 60%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.92), rgba(0,0,0,0.97))",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,0.90)" }} />

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-white/95">About</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/70">
          Hex or Hoax helps you spot scams fast by analyzing messages for social-engineering tactics and producing a safe reply you can send.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-sm font-semibold text-white/90">What it does</div>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>• Illusion % (risk score)</li>
              <li>• Attack type detection</li>
              <li>• Highlights risky phrases</li>
              <li>• Counterspell safe reply</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-sm font-semibold text-white/90">Why it matters</div>
            <p className="mt-3 text-sm text-white/70">
              Phishing, pretexting, and BEC scams rely on urgency and authority. This tool makes those tricks visible and suggests low-risk steps.
            </p>
          </div>
        </div>

        <div className="mt-10 text-xs text-white/55">
          Contact:{" "}
          <a className="text-white/75 underline underline-offset-4 hover:text-white" href="mailto:hexorhoax.team@gmail.com">
            hexorhoax.team@gmail.com
          </a>
        </div>
      </div>
    </main>
  );
}
