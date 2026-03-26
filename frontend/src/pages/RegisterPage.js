import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../api";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await register(email, password);
      if (data.email_verified) {
        navigate("/");
      } else {
        setNeedsVerify(true);
      }
    } catch (err) {
      setError(apiError(err, "Registration failed."));
    } finally {
      setLoading(false);
    }
  };

  if (needsVerify) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-indigo-400">SmartBudget</h1>
          <div className="text-4xl">📬</div>
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="text-sm text-gray-400">
            We sent a verification link to{" "}
            <span className="text-gray-200 font-mono">{email}</span>.
            Click the link to activate your account.
          </p>
          <p className="text-xs text-gray-500">The link expires in 24 hours.</p>
          <Link to="/login" className="block text-sm text-indigo-400 hover:underline mt-2">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-indigo-400 mb-6 text-center">SmartBudget</h1>
        <h2 className="text-lg font-semibold mb-4 text-center">Create Account</h2>
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
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="space-y-1">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 px-1">Min 8 characters, one uppercase letter, one digit.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded transition-colors"
          >
            {loading ? "Creating account…" : "Register"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Have an account?{" "}
          <Link to="/login" className="text-indigo-400 hover:underline">Sign In</Link>
        </p>
        <p className="text-center text-xs text-gray-600 mt-3">
          By registering you agree to our{" "}
          <Link to="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
