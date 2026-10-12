import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api";

const AuthContext = createContext(null);

// JWT payloads are base64url-encoded; atob() needs standard base64.
function isExpired(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(b64));
    return typeof exp === "number" && exp * 1000 < Date.now();
  } catch (_) {
    return true;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !isExpired(token)) {
      setUser({ email: localStorage.getItem("email") || "" });
    } else if (token) {
      localStorage.removeItem("token");
      localStorage.removeItem("email");
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const params = new URLSearchParams();
    params.append("username", email);
    params.append("password", password);
    const { data } = await api.post("/auth/login", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("email", email);
    setUser({ email });
  };

  const register = async (email, password) => {
    const { data } = await api.post("/auth/register", { email, password });
    // If the backend auto-verified (no SMTP configured), log the user in immediately.
    // Otherwise return the response so the caller can show "check your email".
    if (data.email_verified) {
      await login(email, password);
    }
    return data;
  };

  const loginWithToken = async (token) => {
    // Used by MagicLinkPage / VerifyEmailPage after receiving a JWT from the backend.
    // The JWT only carries the user id, so ask the API for the email.
    localStorage.setItem("token", token);
    try {
      const { data } = await api.get("/auth/me");
      localStorage.setItem("email", data.email);
    } catch (_) { /* non-fatal: the session works without the email */ }
    setUser({ email: localStorage.getItem("email") || "" });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithToken, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
