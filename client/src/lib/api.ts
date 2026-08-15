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

// Route-based token selection: admin routes use admin token, game routes use player token
function tokenFor(url: string): string | null {
  if (url.startsWith("/api/admin")) return getAdminToken();
  if (url.startsWith("/api/game/team") || url.startsWith("/api/game/mission") ||
      url.startsWith("/api/game/submit") || url.startsWith("/api/game/hint") ||
      url.startsWith("/api/game/fragments") || url.startsWith("/api/game/vault")) {
    return getPlayerToken();
  }
  return null;
}

export const api = axios.create({ baseURL: "" });

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
      if (url.startsWith("/api/admin")) setAdminToken(null);
      else if (url.startsWith("/api/game")) setPlayerToken(null);
    }
    return Promise.reject(err);
  },
);
