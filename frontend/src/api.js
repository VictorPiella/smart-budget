import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Extract a human-readable message from an axios error.
 * Handles both plain-string detail ("Email already registered.")
 * and Pydantic v2 array detail ([{ msg: "...", loc: [...] }]).
 */
export function apiError(err, fallback = "Something went wrong.") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = d.loc?.slice(1).join(" → ") || "";
        // Pydantic v2 prefixes user-defined messages with "Value error, "
        const msg = (d.msg || "").replace(/^Value error,\s*/i, "");
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" · ");
  }
  return fallback;
}

export default api;
