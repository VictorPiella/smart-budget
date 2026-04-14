import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* ─── tiny animated counter ─────────────────────────────────────────────── */
function Counter({ to, suffix = "", duration = 1400 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(ease * to));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ─── feature card ───────────────────────────────────────────────────────── */
function FeatureCard({ icon, title, body, accent = "cyan" }) {
  const styles = {
    cyan:    { border: "rgba(34,211,238,0.25)",  bg: "rgba(34,211,238,0.07)",  text: "#22d3ee" },
    emerald: { border: "rgba(52,211,153,0.25)",  bg: "rgba(52,211,153,0.07)",  text: "#34d399" },
    sky:     { border: "rgba(56,189,248,0.25)",  bg: "rgba(56,189,248,0.07)",  text: "#38bdf8" },
    amber:   { border: "rgba(251,191,36,0.25)",  bg: "rgba(251,191,36,0.07)",  text: "#fbbf24" },
    rose:    { border: "rgba(251,113,133,0.25)", bg: "rgba(251,113,133,0.07)", text: "#fb7185" },
    violet:  { border: "rgba(167,139,250,0.25)", bg: "rgba(167,139,250,0.07)", text: "#a78bfa" },
  }[accent];
  return (
    <div className="group rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${styles.border}` }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
        style={{ background: styles.bg, color: styles.text }}>{icon}</div>
      <h3 className="font-semibold text-white text-base">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── step pill ──────────────────────────────────────────────────────────── */
function Step({ n, title, body }) {
  return (
    <div className="flex gap-5 items-start">
      <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
        style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 16px rgba(34,211,238,0.3)" }}>
        {n}
      </div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/* ─── mock transaction row ───────────────────────────────────────────────── */
function TxRow({ label, cat, catColor, catBg, amount, neg, manual }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-200 truncate">{label}</p>
      </div>
      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ color: catColor, background: catBg }}>{cat}</span>
      {manual && <span className="text-[10px] text-zinc-600 bg-white/[0.04] border border-white/[0.07] px-1 py-0.5 rounded">M</span>}
      <span className={`text-xs font-semibold tabular-nums shrink-0 ${neg ? "text-red-400" : "text-emerald-400"}`}>
        {neg ? "−" : "+"}{amount}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen text-zinc-100 overflow-x-hidden" style={{ background: "#040408" }}>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50" style={{ background: "rgba(4,4,8,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 14px rgba(34,211,238,0.4)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14v-4m0 0V8m0 4H8m4 0h4" />
              </svg>
            </div>
            <span className="font-bold text-white tracking-tight">SmartBudget</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5">Sign in</Link>
            <Link to="/register" className="text-sm text-white font-medium px-4 py-1.5 rounded-lg transition-all hover:-translate-y-px"
              style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 20px rgba(34,211,238,0.25)" }}>
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-3xl" style={{ background: "rgba(34,211,238,0.07)" }} />
        <div className="pointer-events-none absolute top-10 left-1/4 w-72 h-72 rounded-full blur-3xl" style={{ background: "rgba(34,211,238,0.06)" }} />
        <div className="pointer-events-none absolute top-10 right-1/4 w-72 h-72 rounded-full blur-3xl" style={{ background: "rgba(56,189,248,0.05)" }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
            style={{ border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.08)", color: "#67e8f9" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
            Self-hosted · Your data, your server
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
            <span className="bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              Know exactly where
            </span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-300 bg-clip-text text-transparent">
              your money goes.
            </span>
          </h1>

          <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Import any bank CSV, auto-categorise with smart rules, track investments,
            and review monthly spending — all in a private dashboard you host yourself.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register"
              className="inline-flex items-center justify-center gap-2 text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-sm hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 30px rgba(34,211,238,0.3)" }}>
              Start for free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
            </Link>
            <Link to="/login"
              className="inline-flex items-center justify-center gap-2 text-zinc-200 font-semibold px-7 py-3.5 rounded-xl transition-all text-sm hover:text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              Sign in
            </Link>
          </div>
        </div>

        {/* ── HERO MOCK-UP ── */}
        <div className="relative max-w-3xl mx-auto mt-20">
          <div className="absolute inset-0 rounded-2xl blur-2xl scale-105 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(34,211,238,0.15), transparent)" }} />
          <div className="relative rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            {/* window bar */}
            <div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)" }}>
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <div className="mx-auto text-[11px] text-zinc-600 font-mono">smartbudget — dashboard · April 2026</div>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* balance */}
              <div className="sm:col-span-1 rounded-xl p-4 flex flex-col gap-1" style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.18)" }}>
                <span className="text-xs uppercase tracking-widest font-medium" style={{ color: "rgba(34,211,238,0.7)" }}>Balance</span>
                <span className="text-2xl font-bold text-white">€4,218<span className="text-zinc-400 font-normal text-lg">.52</span></span>
                <span className="text-[11px] text-emerald-400 font-medium">↑ +€312 this month</span>
              </div>
              {/* income */}
              <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Income</span>
                <span className="text-xl font-bold text-emerald-400">+€3,500</span>
                <span className="text-[11px] text-zinc-500">Apr 2026</span>
              </div>
              {/* expenses */}
              <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <span className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Expenses</span>
                <span className="text-xl font-bold text-red-400">−€3,188</span>
                <span className="text-[11px] text-zinc-500">Apr 2026</span>
              </div>
              {/* recent transactions */}
              <div className="sm:col-span-3 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-3">Recent transactions</p>
                <TxRow label="Salary — Acme Corp"     cat="Income"    catColor="#34d399" catBg="rgba(52,211,153,0.1)"  amount="3,500.00" />
                <TxRow label="Deliveroo Order #882"   cat="Food"      catColor="#fb923c" catBg="rgba(251,146,60,0.1)"  amount="28.90"   neg />
                <TxRow label="Netflix subscription"   cat="Streaming" catColor="#f87171" catBg="rgba(248,113,113,0.1)" amount="15.99"   neg manual />
                <TxRow label="Monthly transit pass"   cat="Transport" catColor="#38bdf8" catBg="rgba(56,189,248,0.1)"  amount="54.60"   neg />
                <TxRow label="Mercadona groceries"    cat="Groceries" catColor="#a3e635" catBg="rgba(163,230,53,0.1)"  amount="67.35"   neg />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────────────── */}
      <section className="py-10 px-6" style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { label: "Any bank's CSV",              to: 100, suffix: "%" },
            { label: "Rule match types",             to: 4,   suffix: ""  },
            { label: "Data on your own server",      to: 100, suffix: "%" },
            { label: "Multi-account support",        to: 100, suffix: "%" },
          ].map(({ label, to, suffix }) => (
            <div key={label}>
              <p className="text-3xl font-extrabold text-white"><Counter to={to} suffix={suffix} /></p>
              <p className="text-xs text-zinc-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Everything in one place</h2>
            <p className="text-zinc-400 text-base max-w-lg mx-auto">No subscriptions. No third-party access. A powerful budget tool that runs on your own machine.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard accent="cyan"
              icon="📥"
              title="CSV import from any bank"
              body="Upload a file or paste raw CSV. SmartBudget auto-detects date, description and amount columns before you commit. Supports an extra description column for multi-column banks." />
            <FeatureCard accent="violet"
              icon="🤖"
              title="Smart rule engine"
              body="Build rules using contains, exact, starts-with or regex patterns with priorities. Rules fire automatically on every import and after a manual remap — categorisation runs itself." />
            <FeatureCard accent="emerald"
              icon="📊"
              title="Yearly & monthly review"
              body="Pivot table shows every category month-by-month. Navigate by year or month, click any cell to drill down, edit transactions inline. Income/expense chart included." />
            <FeatureCard accent="amber"
              icon="📬"
              title="Unmapped inbox"
              body="A dedicated zero-inbox view shows only uncategorised transactions. Assign a category inline or create a new rule on the spot — it remaps everything automatically." />
            <FeatureCard accent="sky"
              icon="🏦"
              title="Multiple accounts"
              body="Each account has its own categories, rules, and real-time balance computed from transactions. Credit card, savings, and current accounts stay completely isolated." />
            <FeatureCard accent="rose"
              icon="📈"
              title="Investment tracker"
              body="Log portfolio snapshots over time and visualise your net worth alongside daily spending. Track how your investments grow month after month." />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="py-20 px-6" style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-8">Up and running in minutes</h2>
            <div className="flex flex-col gap-7">
              <Step n="1" title="Create account & add a bank"
                body="Register with email. Add as many bank accounts as you need — each is fully isolated with its own categories and rules." />
              <Step n="2" title="Import your CSV"
                body="Upload your bank's export or paste raw CSV text. SmartBudget previews the column auto-detection and lets you adjust before committing." />
              <Step n="3" title="Build rules once"
                body="Set up keyword, regex or exact-match rules with priority ordering. Hit Remap and every transaction is categorised instantly — including existing ones." />
              <Step n="4" title="Review & stay on top"
                body="Navigate month by month in the Review pivot table. Uncategorised transactions surface in the Inbox. Manual overrides are protected from remap." />
            </div>
          </div>

          {/* Rule engine mockup */}
          <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-xs text-zinc-500 font-medium">Rules — Savings account</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { pat: "NETFLIX",     cat: "Streaming", type: "contains",   pri: 10, color: "#f87171" },
                { pat: "MERCADONA",   cat: "Groceries", type: "contains",   pri: 10, color: "#a3e635" },
                { pat: "^SALARY",     cat: "Income",    type: "regex",      pri: 20, color: "#34d399" },
                { pat: "DELIVEROO",   cat: "Food",      type: "contains",   pri: 10, color: "#fb923c" },
                { pat: "TMB|RENFE",   cat: "Transport", type: "regex",      pri: 10, color: "#38bdf8" },
                { pat: "AMEX PAYMENT",cat: "Transfer",  type: "starts_with",pri: 30, color: "#a78bfa" },
              ].map(({ pat, cat, type, pri, color }) => (
                <div key={pat} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <code className="flex-1 text-zinc-300 font-mono truncate">{pat}</code>
                  <span className="font-semibold text-xs" style={{ color }}>{cat}</span>
                  <span className="text-zinc-600 text-[10px]">{type}</span>
                  <span className="text-zinc-700 text-[10px]">p{pri}</span>
                </div>
              ))}
              <div className="mt-3 text-center">
                <span className="text-[11px] text-cyan-400">+ Add rule</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── REVIEW MOCKUP ───────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-3">Every euro accounted for</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              The yearly review pivot gives you a month-by-month breakdown across all categories.
              Navigate by year or month, click any cell to drill down, and edit transactions inline.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-3">
                <button className="text-xs text-zinc-500 hover:text-white">‹</button>
                <span className="text-sm font-semibold text-white">Review — 2026</span>
                <button className="text-xs text-zinc-600 cursor-not-allowed">›</button>
              </div>
              <div className="flex gap-3 text-xs text-zinc-500">
                <span className="text-cyan-400 font-medium">Yearly</span>
                <span>Monthly</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Category</th>
                    {["Jan","Feb","Mar","Apr","May","Jun"].map(m => (
                      <th key={m} className="text-right px-3 py-2.5 text-zinc-500 font-medium cursor-pointer hover:text-cyan-400 transition-colors">{m}</th>
                    ))}
                    <th className="text-right px-4 py-2.5 text-zinc-400 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { cat: "Groceries",  color: "#a3e635", vals: [180,210,195,225,190,205] },
                    { cat: "Food",       color: "#fb923c", vals: [95, 120,88, 140,102,115] },
                    { cat: "Transport",  color: "#38bdf8", vals: [55, 55, 55, 55, 55, 55]  },
                    { cat: "Streaming",  color: "#f87171", vals: [46, 46, 46, 46, 46, 46]  },
                    { cat: "Transfer",   color: "#a78bfa", vals: [500,500,500,500,500,500], excluded: true },
                    { cat: "Income",     color: "#34d399", vals: [3500,3500,3500,3500,3500,3500] },
                  ].map(({ cat, color, vals, excluded }) => (
                    <tr key={cat} className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: excluded ? 0.5 : 1 }}>
                      <td className="px-4 py-2.5 font-medium flex items-center gap-2" style={{ color }}>
                        {cat}
                        {excluded && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>excluded</span>}
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className="text-right px-3 py-2.5 text-zinc-300 tabular-nums cursor-pointer hover:text-white transition-colors">
                          {v >= 3000 ? `+${v.toLocaleString()}` : `−${v}`}
                        </td>
                      ))}
                      <td className="text-right px-4 py-2.5 font-bold tabular-nums" style={{ color }}>
                        {vals[0] >= 3000 ? `+${(vals[0]*6).toLocaleString()}` : `−${vals.reduce((a,b)=>a+b,0).toLocaleString()}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── REVIEW LINE CHART MOCKUP ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto pb-16 px-6">
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span className="text-xs text-zinc-500 font-medium">Income vs Expenses — 2026</span>
            <div className="flex items-center gap-4">
              {[["#34d399","income"],["#f87171","expenses"],["#818cf8","savings (dashed)"]].map(([c,l]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5" style={{ background: c, ...(l.includes("dashed") ? { backgroundImage: `repeating-linear-gradient(to right, ${c} 0, ${c} 5px, transparent 5px, transparent 8px)`, background: "none" } : {}) }} />
                  <span className="text-[10px] text-zinc-500 capitalize">{l.replace(" (dashed)","")}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            {/* SVG line chart — mirrors the real LineChart with 3 lines */}
            {(() => {
              const W = 540, H = 160, pad = { l: 45, r: 10, t: 10, b: 28 };
              const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
              // monthly data: [income, expenses] — savings = income - expenses
              const data = [
                [3500,2050],[3500,2180],[3500,1920],[3500,2310],[3500,2080],[3500,2200],
                [3500,1980],[3500,2150],[3500,2300],[3500,2050],[3500,2100],[3500,2090],
              ];
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const maxV = 4000;
              const xOf = (i) => pad.l + (i / (data.length - 1)) * iW;
              const yOf = (v) => pad.t + (1 - v / maxV) * iH;
              const polyline = (pts, stroke, dashed) =>
                <polyline key={stroke} points={pts.map(([x,y]) => `${x},${y}`).join(" ")}
                  fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  {...(dashed ? { strokeDasharray: "5 3" } : {})} />;
              const incPts  = data.map(([inc],  i) => [xOf(i), yOf(inc)]);
              const expPts  = data.map(([,exp], i) => [xOf(i), yOf(exp)]);
              const savPts  = data.map(([inc,exp], i) => [xOf(i), yOf(inc - exp)]);
              return (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
                  {/* grid lines */}
                  {[0,1000,2000,3000,4000].map(v => {
                    const y = yOf(v);
                    return <g key={v}>
                      <line x1={pad.l} y1={y} x2={W-pad.r} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                      <text x={pad.l-4} y={y+4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.25)">{v===0?"0":`${v/1000}k`}</text>
                    </g>;
                  })}
                  {/* area under savings */}
                  <polygon
                    points={[...savPts, [xOf(data.length-1), pad.t+iH], [xOf(0), pad.t+iH]].map(([x,y])=>`${x},${y}`).join(" ")}
                    fill="rgba(129,140,248,0.06)" />
                  {polyline(incPts,  "#34d399")}
                  {polyline(expPts,  "#f87171")}
                  {polyline(savPts,  "#818cf8", true)}
                  {/* x-axis labels */}
                  {months.map((m, i) => (
                    <text key={m} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.3)">{m}</text>
                  ))}
                </svg>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── IMPORT FLOW ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6" style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">

          {/* CSV import mockup */}
          <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-xs text-zinc-500 font-medium">Import — column mapping</span>
            </div>
            <div className="p-4 space-y-3">
              {/* upload zone */}
              <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: "rgba(34,211,238,0.25)", background: "rgba(34,211,238,0.04)" }}>
                <p className="text-2xl mb-1">📂</p>
                <p className="text-xs text-zinc-400">Drop CSV file or <span className="text-cyan-400">browse</span></p>
                <p className="text-[10px] text-zinc-600 mt-1">or paste raw CSV text below</p>
              </div>
              {/* auto-detected columns */}
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Auto-detected columns</p>
                {[
                  { label: "Date",        val: "Fecha",     col: 0, ok: true  },
                  { label: "Description", val: "Concepto",  col: 1, ok: true  },
                  { label: "Amount",      val: "Importe",   col: 3, ok: true  },
                  { label: "Extra desc",  val: "(none)",    col: null, ok: false },
                ].map(({ label, val, ok }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{label}</span>
                    <span className={`text-xs font-mono ${ok ? "text-cyan-300" : "text-zinc-600"}`}>{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] px-1">
                <span className="text-zinc-500">12 rows preview</span>
                <button className="text-white font-semibold px-3 py-1.5 rounded-lg" style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)" }}>
                  Import
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.08)", color: "#67e8f9" }}>
              📥 Works with any bank
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4 leading-tight">
              Import from<br />any bank.
            </h2>
            <p className="text-zinc-400 mb-7 leading-relaxed">
              SmartBudget doesn't lock you into one bank. Upload your export or paste raw CSV text —
              it auto-detects the date, description, and amount columns before you commit anything.
              Duplicates are silently skipped via checksum, so re-importing is always safe.
            </p>
            <ul className="space-y-4">
              {[
                ["📂", "File upload or paste",      "Drag-and-drop a CSV file or paste raw text directly — works with whatever your bank exports."],
                ["🔍", "Auto column detection",      "SmartBudget identifies date, description and amount columns automatically. Adjust if needed before committing."],
                ["🔁", "Safe re-import",             "Transactions are deduplicated by checksum. Re-send the same file whenever you want — nothing is double-counted."],
                ["🏷️", "Rules fire on every import", "Your mapping rules run immediately on each new transaction. Inbox stays clean from the start."],
              ].map(([icon, title, desc]) => (
                <li key={title} className="flex gap-3 items-start">
                  <span className="text-xl mt-0.5 shrink-0">{icon}</span>
                  <div>
                    <p className="font-semibold text-white text-sm">{title}</p>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── UNMAPPED INBOX ──────────────────────────────────────────────── */}
      <section className="py-20 px-6" style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">

          {/* Inbox mockup */}
          <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: "#0d0d1a", border: "1px solid rgba(245,158,11,0.2)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs text-zinc-500 font-medium">Unmapped Inbox</span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#f59e0b", color: "#000" }}>7</span>
            </div>
            <div className="p-4">
              {[
                { desc: "AMAZON MKTPLACE EU",    amt: "−€34.99" },
                { desc: "STRIPE CHARGE #91A",    amt: "−€12.00" },
                { desc: "TRANSFER REVOLUT 9284", amt: "−€200.00" },
                { desc: "LIDL SPAIN 00482",      amt: "−€28.50"  },
                { desc: "GOOGLE *CLOUD APRIL",   amt: "−€9.00"   },
              ].map(({ desc, amt }) => (
                <div key={desc} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="text-xs text-zinc-300 truncate flex-1 mr-3">{desc}</span>
                  <span className="text-xs font-mono text-red-400 shrink-0 mr-3">{amt}</span>
                  <button className="text-[11px] px-2 py-1 rounded-lg font-medium shrink-0" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                    Assign ▾
                  </button>
                </div>
              ))}
              <div className="pt-3 text-center">
                <span className="text-[11px] text-zinc-600">+2 more · or <span className="text-cyan-400 cursor-pointer">create a rule</span> to auto-assign</span>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5 w-fit"
              style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#fbbf24" }}>
              📬 Zero-inbox for your transactions
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-4">Never miss an uncategorised transaction.</h2>
            <p className="text-zinc-400 leading-relaxed">
              The Inbox shows only transactions without a category — nothing else. Assign a category inline
              with one click, or create a rule on the spot so all future matching transactions are
              handled automatically. Rules remap everything immediately.
            </p>
          </div>

        </div>
      </section>

      {/* ── INVESTMENTS ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)", color: "#c4b5fd" }}>
              📈 Investment Tracker
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-3">Track your portfolio alongside your spending.</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Select investment categories, log year-end values and cash contributions, and watch your
              all-time return build up year over year — all in one place.
            </p>
          </div>

          {/* Portfolio summary — mirrors the real 3-card layout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total invested (cash)", val: "€24,500.00", color: "text-white" },
              { label: "Total current value",   val: "€31,240.00", color: "text-white" },
              { label: "Net gain / loss",        val: "+€6,740.00 (+27.5%)", color: "text-green-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Investment card — mirrors one category card */}
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: "#a78bfa" }} />
              <span className="font-semibold text-zinc-100">ETF Portfolio</span>
            </div>

            {/* Monthly bar chart */}
            <div>
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Monthly contributions — 2026</p>
              <svg viewBox="0 0 540 110" className="w-full" style={{ height: 110 }}>
                {[0,35,70,105].map(y => (
                  <line key={y} x1="40" y1={y} x2="540" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                ))}
                {[["Jan",500],["Feb",0],["Mar",500],["Apr",500],["May",0],["Jun",500],["Jul",0],["Aug",1000],["Sep",500],["Oct",0],["Nov",500],["Dec",500]].map(([m,v],i) => {
                  const maxH = 90, maxV = 1200;
                  const bH = (v / maxV) * maxH;
                  const x = 48 + i * 41;
                  return (
                    <g key={m}>
                      {bH > 0 && <rect x={x} y={maxH - bH + 10} width="26" height={bH} rx="3" fill="#a78bfa" fillOpacity="0.6" />}
                      <text x={x + 13} y="108" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.25)">{m}</text>
                    </g>
                  );
                })}
                {["0","500","1k"].map((l,i) => (
                  <text key={l} x="36" y={[105,60,15][i]} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.25)">{l}</text>
                ))}
              </svg>
            </div>

            {/* YoY table */}
            <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Year-over-Year</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-zinc-500 uppercase" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Year","Contributed","Cumulative","Value","Annual Gain","%","Recorded"].map(h => (
                        <th key={h} className={`pb-2 ${h === "Year" ? "text-left pr-4" : "text-right pr-4"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { year: 2023, contrib: "€5,000", cumul: "€5,000",  value: "€5,850",  gain: "+€850",   pct: "+17.0%", rec: "31 dic. 2023", pos: true },
                      { year: 2024, contrib: "€6,000", cumul: "€11,000", value: "€14,100", gain: "+€2,400", pct: "+20.5%", rec: "31 dic. 2024", pos: true },
                      { year: 2025, contrib: "€7,500", cumul: "€18,500", value: "€22,890", gain: "+€1,290", pct: "+6.0%",  rec: "31 dic. 2025", pos: true },
                      { year: 2026, contrib: "€6,000", cumul: "€24,500", value: "€31,240", gain: "+€1,850", pct: "+6.3%",  rec: "14 abr. 2026", pos: true, current: true },
                    ].map(({ year, contrib, cumul, value, gain, pct, rec, pos, current }) => (
                      <tr key={year} className="transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: current ? "rgba(34,211,238,0.04)" : undefined }}>
                        <td className={`py-2 pr-4 font-medium ${current ? "text-cyan-300" : "text-zinc-300"}`}>
                          {year} {current && <span className="text-xs font-normal text-cyan-400">(current)</span>}
                        </td>
                        <td className="py-2 pr-4 text-right text-zinc-400">{contrib}</td>
                        <td className="py-2 pr-4 text-right text-white">{cumul}</td>
                        <td className="py-2 pr-4 text-right text-white">{value}</td>
                        <td className={`py-2 pr-4 text-right ${pos ? "text-green-400" : "text-red-400"}`}>{gain}</td>
                        <td className={`py-2 pr-4 text-right font-semibold ${pos ? "text-green-400" : "text-red-400"}`}>{pct}</td>
                        <td className="py-2 text-right text-zinc-600">{rec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── API SECTION ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
            style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)", color: "#c4b5fd" }}>
            ⚙️ For developers & automations
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white mb-3">Bot-friendly auto-import API</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Push transactions programmatically from scripts, bots, or any automation tool.
            Authenticate once, find your account ID, and POST JSON — rules fire and duplicates are skipped automatically.
          </p>
        </div>
        <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden shadow-xl" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)" }}>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <span className="text-[11px] text-zinc-600 font-mono ml-2">POST /api/accounts/{"{id}"}/import/auto</span>
          </div>
          <pre className="p-5 text-[12px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`{
  "transactions": [
    {
      "date": "2026-04-01",
      "description": "NETFLIX.COM",
      "amount": -15.99
    },
    {
      "date": "2026-04-03",
      "description": "SALARY ACME CORP",
      "amount": 3500.00
    }
  ]
}

// Response
{
  "imported": 2,
  "skipped_duplicates": 0,
  "transactions": [ ... ]
}`}
          </pre>
        </div>
      </section>

      {/* ── SECURITY BADGE STRIP ─────────────────────────────────────────── */}
      <section className="py-12 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs text-zinc-600 uppercase tracking-widest font-medium mb-6">Security built-in</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "🔐 bcrypt passwords",
              "🛡️ JWT auth · 8h expiry",
              "⏱️ Rate limiting",
              "📧 Magic-link login",
              "✉️ Email verification",
              "🚫 CSP headers",
              "🧹 GDPR account deletion",
              "📦 Self-hosted Postgres",
              "🐳 Docker compose",
            ].map(b => (
              <span key={b} className="px-3 py-1.5 rounded-full text-xs text-zinc-300"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="pointer-events-none absolute inset-0 -m-20 rounded-full blur-3xl" style={{ background: "rgba(34,211,238,0.06)" }} />
          <h2 className="relative text-4xl font-extrabold tracking-tight text-white mb-4">Take control of your finances.</h2>
          <p className="relative text-zinc-400 mb-8">Free. Open. Private. Deploy on your own server with Docker in minutes.</p>
          <Link to="/register"
            className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl transition-all text-sm hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 30px rgba(34,211,238,0.25)" }}>
            Create your free account
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
          </Link>
          <p className="text-xs text-zinc-600 mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-zinc-500 hover:text-zinc-300 transition-colors">Sign in</Link>
          </p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14v-4m0 0V8m0 4H8m4 0h4" />
              </svg>
            </div>
            <span className="font-medium text-zinc-500">SmartBudget</span>
          </div>
          <div className="flex gap-5">
            <Link to="/privacy-policy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link to="/login"          className="hover:text-zinc-400 transition-colors">Sign in</Link>
            <Link to="/register"       className="hover:text-zinc-400 transition-colors">Register</Link>
          </div>
          <span>Self-hosted · Your data, your server</span>
        </div>
      </footer>

    </div>
  );
}
