import { useCallback, useEffect, useState } from "react";
import { api, getAdminToken, getPlayerToken, setAdminToken, setPlayerToken } from "../lib/api";

export function useAdminAuth() {
  const [token, setTok] = useState<string | null>(getAdminToken());
  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/api/auth/admin/login", { email, password });
    setAdminToken(data.token);
    setTok(data.token);
    return data;
  }, []);
  const register = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/api/auth/admin/register", { email, password });
    setAdminToken(data.token);
    setTok(data.token);
    return data;
  }, []);
  const logout = useCallback(() => {
    setAdminToken(null);
    setTok(null);
  }, []);
  return { token, isAuthed: !!token, login, register, logout };
}

export function usePlayerAuth() {
  const [token, setTok] = useState<string | null>(getPlayerToken());
  const [team, setTeam] = useState<any>(() => {
    const raw = localStorage.getItem("nexus.player.team");
    return raw ? JSON.parse(raw) : null;
  });

  const join = useCallback(async (code: string) => {
    const { data } = await api.post("/api/auth/team/join", { code });
    setPlayerToken(data.token);
    localStorage.setItem("nexus.player.team", JSON.stringify(data.team));
    setTok(data.token);
    setTeam(data.team);
    return data;
  }, []);

  const logout = useCallback(() => {
    setPlayerToken(null);
    localStorage.removeItem("nexus.player.team");
    setTok(null);
    setTeam(null);
  }, []);

  useEffect(() => {
    // If token was removed elsewhere, sync
    const t = getPlayerToken();
    if (t !== token) setTok(t);
  }, [token]);

  return { token, isAuthed: !!token, team, join, logout };
}
