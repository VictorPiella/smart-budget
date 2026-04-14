import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(apiError(err, "Login failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm card p-5 p-8">
        <h1 className="text-2xl font-bold text-cyan-400 mb-6 text-center">SmartBudget</h1>
        <h2 className="text-lg font-semibold mb-4 text-center">Sign In</h2>
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white/[0.04] border border-white/[0.07] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-white/[0.04] border border-white/[0.07] rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white font-medium py-2 rounded transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="text-center text-sm text-zinc-500 mt-4">
          No account?{" "}
          <Link to="/register" className="text-cyan-400 hover:underline">
            Register
          </Link>
        </p>
        <p className="text-center text-sm text-zinc-600 mt-2">
          <Link to="/forgot-password" className="hover:text-zinc-400 transition-colors">
            Forgot password?
          </Link>
        </p>
        <p className="text-center text-xs text-zinc-700 mt-3">
          <Link to="/privacy-policy" className="hover:text-zinc-500 transition-colors">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
