import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api, { apiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function MagicLinkPage() {
  const [searchParams]      = useSearchParams();
  const { loginWithToken }  = useAuth();
  const navigate            = useNavigate();
  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No token found in the link. Please request a new one.");
      return;
    }

    api.post("/auth/verify-magic-link", { token })
      .then(({ data }) => {
        loginWithToken(data.access_token);
        setStatus("success");
        // Brief pause so user sees the success state, then redirect
        setTimeout(() => navigate("/", { replace: true }), 1200);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(
          apiError(err, "This link is invalid or has expired.")
        );
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0">
      <div className="w-full max-w-sm card p-5 p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-cyan-400">SmartBudget</h1>

        {status === "verifying" && (
          <>
            <div className="text-3xl animate-pulse">🔐</div>
            <p className="text-zinc-400 text-sm">Verifying your link…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-3xl">✅</div>
            <p className="text-green-400 font-semibold">Signed in! Redirecting…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-3xl">❌</div>
            <p className="text-red-400 font-semibold">Link expired or invalid</p>
            <p className="text-sm text-zinc-400">{errorMsg}</p>
            <Link
              to="/forgot-password"
              className="inline-block mt-2 bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              Request a new link
            </Link>
            <p className="text-xs text-zinc-500 mt-2">
              Or{" "}
              <Link to="/login" className="text-cyan-400 hover:underline">
                sign in with your password
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
