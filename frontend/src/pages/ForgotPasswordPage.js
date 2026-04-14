import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(apiError(err, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm card p-5 p-8">
        <h1 className="text-2xl font-bold text-cyan-400 mb-6 text-center">SmartBudget</h1>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">📬</div>
            <h2 className="text-lg font-semibold">Check your inbox</h2>
            <p className="text-sm text-zinc-400">
              If <span className="text-zinc-200 font-mono">{email}</span> is registered, we've sent
              a login link. It expires in <strong className="text-white">1 hour</strong>.
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Didn't get it? Check spam, or{" "}
              <button
                onClick={() => { setSent(false); setError(""); }}
                className="text-cyan-400 hover:underline"
              >
                try again
              </button>
              .
            </p>
            <Link to="/login" className="block text-sm text-cyan-400 hover:underline mt-4">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-1 text-center">Forgot password?</h2>
            <p className="text-sm text-zinc-500 mb-5 text-center">
              Enter your email and we'll send you a magic login link.
            </p>

            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="bg-white/[0.04] border border-white/[0.07] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white font-medium py-2 rounded transition-colors"
              >
                {loading ? "Sending…" : "Send login link"}
              </button>
            </form>

            <p className="text-center text-sm text-zinc-500 mt-4">
              <Link to="/login" className="text-cyan-400 hover:underline">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
