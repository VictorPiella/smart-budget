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
function FeatureCard({ icon, title, body, accent = "indigo" }) {
  const border = {
    indigo: "border-indigo-500/30 hover:border-indigo-400/60",
    violet: "border-violet-500/30 hover:border-violet-400/60",
    emerald: "border-emerald-500/30 hover:border-emerald-400/60",
    sky:    "border-sky-500/30    hover:border-sky-400/60",
    amber:  "border-amber-500/30  hover:border-amber-400/60",
    rose:   "border-rose-500/30   hover:border-rose-400/60",
  }[accent];
  const iconBg = {
    indigo: "bg-indigo-500/10 text-indigo-400",
    violet: "bg-violet-500/10 text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    sky:    "bg-sky-500/10    text-sky-400",
    amber:  "bg-amber-500/10  text-amber-400",
    rose:   "bg-rose-500/10   text-rose-400",
  }[accent];
  return (
    <div className={`group rounded-2xl border bg-gray-900/60 backdrop-blur p-6 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 ${border}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${iconBg}`}>{icon}</div>
      <h3 className="font-semibold text-white text-base">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── step pill ──────────────────────────────────────────────────────────── */
function Step({ n, title, body }) {
  return (
    <div className="flex gap-5 items-start">
      <div className="shrink-0 w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-900/50">{n}</div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-sm text-gray-400 mt-0.5">{body}</p>
      </div>
    </div>
  );
}

/* ─── mock transaction row ───────────────────────────────────────────────── */
function TxRow({ icon, label, cat, catColor, amount, neg }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-base shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 truncate">{label}</p>
        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${catColor}`}>{cat}</span>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${neg ? "text-red-400" : "text-emerald-400"}`}>
        {neg ? "−" : "+"}{amount}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">$</div>
            <span className="font-bold text-white tracking-tight">SmartBudget</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"    className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5">Sign in</Link>
            <Link to="/register" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-900/40">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* glow blobs */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute top-10 left-1/4 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute top-10 right-1/4 w-72 h-72 bg-sky-600/8  rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
            Self-hosted · Your data, your server
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
            <span className="bg-gradient-to-br from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              Know exactly where
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
              your money goes.
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Import bank CSVs, auto-categorise transactions with smart rules,
            review spending trends — all in one private dashboard you control.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register"
              className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-900/50 hover:shadow-indigo-900/70 hover:-translate-y-0.5 text-sm">
              Start for free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
            </Link>
            <Link to="/login"
              className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold px-7 py-3.5 rounded-xl transition-all text-sm">
              Sign in
            </Link>
          </div>
        </div>

        {/* ── HERO MOCK-UP ── */}
        <div className="relative max-w-3xl mx-auto mt-20">
          {/* outer glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-indigo-600/20 to-transparent blur-2xl scale-105 pointer-events-none" />
          <div className="relative rounded-2xl border border-gray-700/60 bg-gray-900 shadow-2xl shadow-black/60 overflow-hidden">
            {/* window bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-800 bg-gray-900/80">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <div className="mx-auto text-[11px] text-gray-600 font-mono">smartbudget — dashboard</div>
            </div>
            {/* content */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* balance card */}
              <div className="sm:col-span-1 rounded-xl bg-indigo-600/10 border border-indigo-500/20 p-4 flex flex-col gap-1">
                <span className="text-xs text-indigo-300/70 uppercase tracking-widest font-medium">Balance</span>
                <span className="text-2xl font-bold text-white">€4,218<span className="text-gray-400 font-normal text-lg">.52</span></span>
                <span className="text-[11px] text-emerald-400 font-medium">↑ +€312 this month</span>
              </div>
              {/* income / expense */}
              <div className="rounded-xl bg-gray-800/60 border border-gray-700/40 p-4 flex flex-col gap-1">
                <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">Income</span>
                <span className="text-xl font-bold text-emerald-400">+€3,500</span>
                <span className="text-[11px] text-gray-500">Mar 2026</span>
              </div>
              <div className="rounded-xl bg-gray-800/60 border border-gray-700/40 p-4 flex flex-col gap-1">
                <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">Expenses</span>
                <span className="text-xl font-bold text-red-400">−€3,188</span>
                <span className="text-[11px] text-gray-500">Mar 2026</span>
              </div>
              {/* recent transactions */}
              <div className="sm:col-span-3 rounded-xl bg-gray-800/40 border border-gray-700/40 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-medium mb-3">Recent transactions</p>
                <TxRow icon="🍕" label="Deliveroo Order #882" cat="Food"        catColor="text-orange-400 bg-orange-400/10" amount="€28.90"  neg />
                <TxRow icon="💼" label="Salary — Acme Corp"   cat="Income"     catColor="text-emerald-400 bg-emerald-400/10" amount="€3,500.00" />
                <TxRow icon="🎬" label="Netflix subscription"  cat="Streaming"  catColor="text-red-400 bg-red-400/10"    amount="€15.99"  neg />
                <TxRow icon="🚇" label="Monthly transit pass"  cat="Transport"  catColor="text-sky-400 bg-sky-400/10"    amount="€54.60"  neg />
                <TxRow icon="🛒" label="Mercadona groceries"   cat="Groceries"  catColor="text-lime-400 bg-lime-400/10"  amount="€67.35"  neg />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────────────── */}
      <section className="border-y border-gray-800/60 bg-gray-900/40 py-10 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { label: "Transactions tracked",  to: 50000, suffix: "+" },
            { label: "Smart-rule categories", to: 200,   suffix: "+" },
            { label: "CSV banks supported",   to: 100,   suffix: "%" },
            { label: "Data stored on YOUR VPS", to: 100, suffix: "%" },
          ].map(({ label, to, suffix }) => (
            <div key={label}>
              <p className="text-3xl font-extrabold text-white"><Counter to={to} suffix={suffix} /></p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">Everything you need, nothing you don't</h2>
            <p className="text-gray-400 text-base max-w-lg mx-auto">No subscriptions. No third-party access. Just a powerful budget tool that runs on your machine.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard accent="indigo"
              icon="📤"
              title="One-click CSV import"
              body="Drop any bank export and SmartBudget auto-detects date, description and amount columns. 50,000 rows in seconds." />
            <FeatureCard accent="violet"
              icon="🤖"
              title="Automatic rule engine"
              body="Define keyword or regex patterns once. Every matching transaction is categorised instantly — even on re-import." />
            <FeatureCard accent="emerald"
              icon="📊"
              title="Spending review"
              body="Pivot table by year or month. Drill into any cell, edit inline, and see your totals recalculate in real time." />
            <FeatureCard accent="sky"
              icon="📬"
              title="Unmapped inbox"
              body="Never miss an uncategorised transaction. The inbox shows only what needs your attention so nothing slips through." />
            <FeatureCard accent="amber"
              icon="📈"
              title="Investments tracker"
              body="Log portfolio snapshots over time and visualise your net worth alongside your daily spending — all in one place." />
            <FeatureCard accent="rose"
              icon="🔒"
              title="100% self-hosted"
              body="Runs on your VPS in Docker. Postgres data never leaves your machine. Magic-link auth, rate limiting, CSP headers included." />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-900/40 border-y border-gray-800/60">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-8">Up and running in minutes</h2>
            <div className="flex flex-col gap-7">
              <Step n="1" title="Create your account"        body="Register with email. Verification email sent automatically when SMTP is configured." />
              <Step n="2" title="Add a bank account"         body="Create as many accounts as you have banks. Each is completely isolated — categories, rules and balances are per-account." />
              <Step n="3" title="Import your CSV"            body="Upload your bank's export or paste raw CSV. SmartBudget previews column detection before committing." />
              <Step n="4" title="Set up rules once"          body="Build keyword or regex rules with priorities. Hit Remap and every transaction is categorised instantly." />
            </div>
          </div>
          {/* inline rule mockup */}
          <div className="rounded-2xl border border-gray-700/60 bg-gray-900 overflow-hidden shadow-xl shadow-black/40">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-xs text-gray-500 font-medium">Rules — Savings account</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { pat: "NETFLIX",      cat: "Streaming", type: "contains", pri: 10, color: "text-red-400"     },
                { pat: "MERCADONA",    cat: "Groceries", type: "contains", pri: 10, color: "text-lime-400"    },
                { pat: "^SALARY",      cat: "Income",    type: "regex",    pri: 20, color: "text-emerald-400" },
                { pat: "DELIVEROO",    cat: "Food",      type: "contains", pri: 10, color: "text-orange-400"  },
                { pat: "TMB|RENFE",    cat: "Transport", type: "regex",    pri: 10, color: "text-sky-400"     },
              ].map(({ pat, cat, type, pri, color }) => (
                <div key={pat} className="flex items-center gap-2 text-xs bg-gray-800/60 rounded-lg px-3 py-2">
                  <code className="flex-1 text-gray-300 font-mono truncate">{pat}</code>
                  <span className={`font-semibold ${color}`}>{cat}</span>
                  <span className="text-gray-600 text-[10px]">{type}</span>
                  <span className="text-gray-700 text-[10px]">p{pri}</span>
                </div>
              ))}
              <div className="mt-3 text-center">
                <span className="text-[11px] text-indigo-400 cursor-pointer hover:underline">+ Add rule</span>
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
            <p className="text-gray-400 max-w-lg mx-auto">The yearly review pivot gives you a month-by-month breakdown across all categories. Click any cell to drill down.</p>
          </div>

          <div className="rounded-2xl border border-gray-700/60 bg-gray-900 overflow-hidden shadow-2xl shadow-black/60">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Review — 2026</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-indigo-400 font-medium">Yearly</span>
                <span>Monthly</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Category</th>
                    {["Jan","Feb","Mar","Apr","May","Jun"].map(m => (
                      <th key={m} className="text-right px-3 py-2.5 text-gray-500 font-medium">{m}</th>
                    ))}
                    <th className="text-right px-4 py-2.5 text-gray-400 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { cat: "🛒 Groceries",  vals: [180, 210, 195, 225, 190, 205], color: "text-lime-400"   },
                    { cat: "🍕 Food",        vals: [95,  120, 88,  140, 102, 115], color: "text-orange-400" },
                    { cat: "🚇 Transport",   vals: [55,  55,  55,  55,  55,  55],  color: "text-sky-400"    },
                    { cat: "🎬 Streaming",   vals: [46,  46,  46,  46,  46,  46],  color: "text-red-400"    },
                    { cat: "💼 Income",      vals: [3500,3500,3500,3500,3500,3500], color: "text-emerald-400"},
                  ].map(({ cat, vals, color }) => (
                    <tr key={cat} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                      <td className={`px-4 py-2.5 font-medium ${color}`}>{cat}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="text-right px-3 py-2.5 text-gray-300 tabular-nums">
                          {v >= 3000 ? `+${v.toLocaleString()}` : `-${v}`}
                        </td>
                      ))}
                      <td className={`text-right px-4 py-2.5 font-bold tabular-nums ${color}`}>
                        {vals[0] >= 3000 ? `+${(vals[0]*6).toLocaleString()}` : `-${vals.reduce((a,b)=>a+b,0).toLocaleString()}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY BADGE STRIP ─────────────────────────────────────────── */}
      <section className="py-12 px-6 border-t border-gray-800/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-xs text-gray-600 uppercase tracking-widest font-medium mb-6">Security built-in</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "🔐 bcrypt passwords",
              "🛡️ JWT auth (8h expiry)",
              "⏱️ Rate limiting (slowapi)",
              "📧 Magic-link login",
              "🚫 CSP headers",
              "🧹 GDPR account deletion",
              "✉️ Email verification",
              "📦 Self-hosted Postgres",
            ].map(b => (
              <span key={b} className="px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-300">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="relative max-w-2xl mx-auto text-center">
          <div className="pointer-events-none absolute inset-0 -m-20 bg-indigo-600/8 rounded-full blur-3xl" />
          <h2 className="relative text-4xl font-extrabold tracking-tight text-white mb-4">Take control of your finances today.</h2>
          <p className="relative text-gray-400 mb-8">Free. Open. Private. Deploy on your own server in under 5 minutes with Docker.</p>
          <Link to="/register"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-900/50 hover:-translate-y-0.5 text-sm">
            Create your free account
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
          </Link>
          <p className="text-xs text-gray-600 mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-gray-500 hover:text-gray-300 transition-colors">Sign in</Link>
          </p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800/60 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">$</div>
            <span className="font-medium text-gray-500">SmartBudget</span>
          </div>
          <div className="flex gap-5">
            <Link to="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
            <Link to="/login"          className="hover:text-gray-400 transition-colors">Sign in</Link>
            <Link to="/register"       className="hover:text-gray-400 transition-colors">Register</Link>
          </div>
          <span>Self-hosted · Your data, your server</span>
        </div>
      </footer>

    </div>
  );
}
