import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api, { apiError } from "../api";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmailPage() {
  const [searchParams]      = useSearchParams();
  const { loginWithToken }  = useAuth();
  const navigate            = useNavigate();
  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found. Please use the link from your email.");
      return;
    }

    api.post("/auth/verify-email", { token })
      .then(({ data }) => {
        loginWithToken(data.access_token);
        setStatus("success");
        setTimeout(() => navigate("/", { replace: true }), 1500);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(
          apiError(err, "This verification link is invalid or has expired.")
        );
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-indigo-400">SmartBudget</h1>

        {status === "verifying" && (
          <>
            <div className="text-3xl animate-pulse">📧</div>
            <p className="text-gray-400 text-sm">Verifying your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-3xl">✅</div>
            <p className="text-green-400 font-semibold">Email verified! Welcome aboard.</p>
            <p className="text-gray-500 text-sm">Redirecting to your dashboard…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-3xl">❌</div>
            <p className="text-red-400 font-semibold">Verification failed</p>
            <p className="text-sm text-gray-400">{errorMsg}</p>
            <p className="text-xs text-gray-500 mt-2">
              Need a new link?{" "}
              <Link to="/register" className="text-indigo-400 hover:underline">
                Register again
              </Link>{" "}
              or{" "}
              <Link to="/login" className="text-indigo-400 hover:underline">
                sign in
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
