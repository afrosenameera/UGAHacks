import Link from "next/link";

export default function HistoryPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      {/* purple + green background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 700px at 18% 22%, rgba(168,85,247,0.22), rgba(0,0,0,0) 60%)," +
            "radial-gradient(900px 700px at 82% 30%, rgba(34,197,94,0.18), rgba(0,0,0,0) 60%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.97))",
        }}
      />

      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight text-white/95">History</h1>
          <Link
            href="/analyze"
            className="rounded-xl bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10"
          >
            Back to Analyze
          </Link>
        </div>

        <p className="mt-3 text-sm text-white/70">
          This page is optional. Your analyzer already shows history in the left drawer (stored locally).
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          If you don’t need a separate history page, you can also delete the entire <span className="text-white/85 font-semibold">src/app/history</span>{" "}
          folder.
        </div>
      </div>
    </main>
  );
}
