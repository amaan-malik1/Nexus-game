import axios from "axios";

export const ADMIN_TOKEN_KEY = "nexus.admin.token";
export const PLAYER_TOKEN_KEY = "nexus.player.token";

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
export function getPlayerToken(): string | null {
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}
export function setAdminToken(t: string | null) {
  if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}
export function setPlayerToken(t: string | null) {
  if (t) localStorage.setItem(PLAYER_TOKEN_KEY, t);
  else localStorage.removeItem(PLAYER_TOKEN_KEY);
}

// Route-based token selection: admin routes use admin token; every game route
// EXCEPT the two explicitly public ones gets the player token.
const PUBLIC_GAME_ROUTES = ["/api/game/status", "/api/game/leaderboard"];
function tokenFor(url: string): string | null {
  if (url.startsWith("/api/admin")) return getAdminToken();
  if (url.startsWith("/api/game")) {
    if (PUBLIC_GAME_ROUTES.some((p) => url.startsWith(p))) return null;
    return getPlayerToken();
  }
  return null;
}

// In dev, Vite proxies /api → localhost:4000 (see vite.config.ts).
// In prod (Vercel), set VITE_API_BASE_URL to your Render backend origin, e.g.
//   VITE_API_BASE_URL=https://nexus-api.onrender.com
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const t = tokenFor(cfg.url || "");
  if (t) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as any).Authorization = `Bearer ${t}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const url: string = err.config?.url || "";
      // Only clear tokens if we actually SENT one — a 401 with no token attached
      // means we routed the request wrong, not that the token is bad. Wiping
      // localStorage in that case would log the user out over a client bug.
      const sentAuth = !!err.config?.headers?.Authorization;
      if (sentAuth) {
        if (url.startsWith("/api/admin")) setAdminToken(null);
        else if (url.startsWith("/api/game")) setPlayerToken(null);
      }
    }
    return Promise.reject(err);
  },
);
