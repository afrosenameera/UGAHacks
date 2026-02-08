import Link from "next/link";

const RESOURCES = [
  {
    title: "OWASP — Social Engineering",
    url: "https://owasp.org/",
    note: "General background on social engineering patterns.",
  },
  {
    title: "CISA — Avoiding Social Engineering & Phishing Attacks",
    url: "https://www.cisa.gov/",
    note: "Practical guidance + common red flags.",
  },
  {
    title: "FBI — Business Email Compromise (BEC)",
    url: "https://www.ic3.gov/",
    note: "BEC/CEO fraud overview and reporting info.",
  },
  {
    title: "FTC — How to Recognize and Avoid Phishing Scams",
    url: "https://consumer.ftc.gov/",
    note: "Consumer-facing scam identification tips.",
  },
  {
    title: "Google Safe Browsing",
    url: "https://safebrowsing.google.com/",
    note: "Used as inspiration for suspicious link handling patterns.",
  },
];

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white/95">Resources</h1>
            <p className="mt-2 text-sm text-white/65">
              References and inspirations used for Hex or Hoax (UGAHacks).
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10"
          >
            Back
          </Link>
        </div>

        <div className="mt-8 grid gap-4">
          {RESOURCES.map((r, idx) => (
            <a
              key={idx}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"
            >
              <div className="text-base font-semibold text-white/90">{r.title}</div>
              <div className="mt-1 text-sm text-white/65">{r.note}</div>
              <div className="mt-3 text-xs text-white/55 underline underline-offset-4">
                Open source
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
