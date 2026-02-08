import Analyzer from "@/components/Analyzer";

export default function AnalyzePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      {/* 🌌 Ambient color background (PURPLE + GREEN + BLACK) */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            // purple glow (left)
            "radial-gradient(900px 700px at 15% 25%, rgba(168,85,247,0.28), rgba(16885,247,0.28) 60%)," +
            // green glow (right)
            "radial-gradient(900px 700px at 85% 30%, rgba(34,197,94,0.24), rgba(34, 197,94,0.24) 60%)," +
            // subtle center lift
            "radial-gradient(1100px 900px at 50% 90%, rgba(255,255,255,0.05), rgba(255, 255,255,0.05) 70%)," +
            // black base
            "linear-gradient(180deg, rgba(0,0,0,0.88), rgba(0,0,0,0.97))",
        }}
      />

      {/* vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            // purple glow (left)
            "radial-gradient(900px 700px at 15% 25%, rgba(168,85,247,0.28), rgba(16885,247,0.28) 60%)," +
            // green glow (right)
            "radial-gradient(900px 700px at 85% 30%, rgba(34,197,94,0.24), rgba(34, 197,94,0.24) 60%)," +
            // subtle center lift
            "radial-gradient(1100px 900px at 50% 90%, rgba(255,255,255,0.05), rgba(255, 255,255,0.05) 70%)," +
            // black base
            "linear-gradient(180deg, rgba(0,0,0,0.88), rgba(0,0,0,0.97))",
        }}
      />

      {/* content */}
      <div className="relative z-10 px-6 py-6">
        <Analyzer />
      </div>
    </main>
  );
}
