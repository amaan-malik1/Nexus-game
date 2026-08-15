import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../services/game.service.js";
import { signToken } from "../utils/jwt.js";

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function registerAdmin(req: Request, res: Response) {
  const existing = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existing > 0)
    return res.status(403).json({ error: "Admin already exists. Registration disabled." });
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hash, role: "ADMIN" },
  });
  const token = signToken({ role: "ADMIN", userId: user.id });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}

export async function loginAdmin(req: Request, res: Response) {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "ADMIN")
    return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = signToken({ role: "ADMIN", userId: user.id });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}

const joinSchema = z.object({ code: z.string().min(4).max(12) });

export async function joinTeam(req: Request, res: Response) {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const code = parsed.data.code.trim().toUpperCase();
  const team = await prisma.team.findUnique({ where: { code } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  const token = signToken({ role: "PLAYER", teamId: team.id });
  res.json({
    token,
    team: { id: team.id, name: team.name, code: team.code, score: team.score },
  });
}

export async function adminBootstrapStatus(_req: Request, res: Response) {
  const count = await prisma.user.count({ where: { role: "ADMIN" } });
  res.json({ needsBootstrap: count === 0 });
}
