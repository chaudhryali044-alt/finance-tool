import Link from "next/link";

const features = [
  {
    icon: "◈",
    title: "Capital Raise Matcher",
    description:
      "Input your company profile and raise details. Meridian searches live fund activity signals across the internet and generates a precision-matched investor list with outreach angles.",
    href: "/raise",
    cta: "Find Investors →",
  },
  {
    icon: "◉",
    title: "Deal Signal Monitor",
    description:
      "Enter a company name or sector. Meridian scans news, SEC filings, and company data to detect acquisition signals, identify likely acquirers, and generate a full mandate brief.",
    href: "/deals",
    cta: "Analyse Deals →",
  },
  {
    icon: "◎",
    title: "Mandate Watchlist",
    description:
      "Save any company from either tool to your private watchlist. Signals refresh automatically every Monday morning. Get notified when deal dynamics change.",
    href: "/watchlist",
    cta: "View Watchlist →",
  },
];

const steps = {
  raise: [
    { num: "01", title: "Describe your company", body: "Enter your company name, sector, stage, amount raising, and target geography." },
    { num: "02", title: "AI scans the market", body: "Meridian searches recent fund activity, closings, and investment signals across hundreds of sources." },
    { num: "03", title: "Receive matched investors", body: "Get a ranked investor list with cheque sizes, mandate fit analysis, and personalised outreach angles." },
  ],
  deals: [
    { num: "01", title: "Enter a company or sector", body: "Search by company name or describe a sector — e.g. 'UK fintech', 'UAE healthcare'." },
    { num: "02", title: "Signals detected", body: "Meridian pulls SEC filings, Companies House data, and live news to detect acquisition indicators." },
    { num: "03", title: "Full mandate brief generated", body: "Receive a professional deal signal report with acquirer universe, valuation range, and strategic rationale." },
  ],
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="hero-bg relative min-h-screen flex flex-col items-center justify-center px-6 pt-16 overflow-hidden">
        {/* Ambient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gold/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-gold/3 blur-[100px] pointer-events-none" />

        {/* Overline */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <div className="h-px w-12 bg-gold" />
          <span className="text-gold text-xs tracking-[0.3em] uppercase font-mono">
            AI Deal Intelligence
          </span>
          <div className="h-px w-12 bg-gold" />
        </div>

        {/* Headline */}
        <h1 className="font-playfair text-center text-5xl sm:text-7xl lg:text-8xl font-semibold text-text-primary leading-[1.1] tracking-tight mb-6 max-w-4xl animate-slide-up">
          Deal Intelligence.
          <br />
          <span className="text-gold-gradient italic">In Seconds.</span>
        </h1>

        <p className="text-center text-text-secondary text-lg sm:text-xl max-w-2xl leading-relaxed mb-12 animate-fade-in">
          AI-powered acquisition signals, investor matching, and mandate briefs
          for bankers, investors, and founders.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 animate-fade-in">
          <Link
            href="/raise"
            className="btn-gold px-8 py-4 rounded text-sm font-semibold tracking-wide"
          >
            Find Investors →
          </Link>
          <Link
            href="/deals"
            className="px-8 py-4 rounded text-sm font-semibold tracking-wide border border-border text-text-secondary hover:border-gold/50 hover:text-text-primary transition-colors duration-200"
          >
            Find Deals →
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-secondary/40">
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-text-secondary/40 to-transparent" />
        </div>
      </section>

      {/* Divider */}
      <div className="gold-line mx-auto max-w-7xl" />

      {/* Features */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase font-mono mb-4">Platform</p>
          <h2 className="font-playfair text-4xl sm:text-5xl text-text-primary">
            Three tools. One platform.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card border border-border rounded-lg p-8 card-hover"
            >
              <span className="text-gold text-2xl mb-6 block">{f.icon}</span>
              <h3 className="font-playfair text-xl text-text-primary mb-3">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed mb-6">
                {f.description}
              </p>
              <Link
                href={f.href}
                className="text-gold text-sm tracking-wide hover:text-gold-light transition-colors"
              >
                {f.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <div className="gold-line mx-auto max-w-7xl" />

      {/* How it works */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-gold text-xs tracking-[0.3em] uppercase font-mono mb-4">Process</p>
          <h2 className="font-playfair text-4xl sm:text-5xl text-text-primary">How it works</h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16">
          {/* Capital Raise */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-gold font-mono text-xs tracking-widest uppercase">Capital Raise</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-8">
              {steps.raise.map((step) => (
                <div key={step.num} className="flex gap-6">
                  <span className="font-mono text-gold/40 text-sm flex-shrink-0 mt-0.5">{step.num}</span>
                  <div>
                    <h4 className="text-text-primary font-semibold mb-1">{step.title}</h4>
                    <p className="text-text-secondary text-sm leading-relaxed">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/raise" className="inline-block mt-8 btn-gold px-6 py-3 rounded text-sm">
              Find Investors →
            </Link>
          </div>

          {/* Deal Signals */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="text-gold font-mono text-xs tracking-widest uppercase">Deal Signals</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-8">
              {steps.deals.map((step) => (
                <div key={step.num} className="flex gap-6">
                  <span className="font-mono text-gold/40 text-sm flex-shrink-0 mt-0.5">{step.num}</span>
                  <div>
                    <h4 className="text-text-primary font-semibold mb-1">{step.title}</h4>
                    <p className="text-text-secondary text-sm leading-relaxed">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/deals" className="inline-block mt-8 btn-gold px-6 py-3 rounded text-sm">
              Analyse Deals →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start">
            <span className="font-playfair text-2xl text-text-primary">Meridian</span>
            <span className="text-text-secondary text-xs tracking-widest uppercase mt-1">
              Deal Intelligence Platform
            </span>
          </div>
          <div className="flex flex-col items-center md:items-end gap-1">
            <span className="text-text-secondary text-sm">Built by Ali Chaudhry</span>
            <span className="text-text-secondary/40 text-xs">
              © {new Date().getFullYear()} Meridian
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
