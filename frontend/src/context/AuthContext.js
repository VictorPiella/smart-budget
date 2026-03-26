import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const email = localStorage.getItem("email");
    if (token && email) setUser({ email });
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

  const loginWithToken = (token) => {
    // Used by MagicLinkPage after receiving a JWT from the backend.
    // We don't know the email at this point — it will be loaded on next page visit.
    localStorage.setItem("token", token);
    // Decode the email from the JWT payload if available, otherwise use a placeholder
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.email) localStorage.setItem("email", payload.email);
    } catch (_) { /* ignore decode errors */ }
    // Trigger a reload so AccountContext and Layout re-initialise with the new token
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
