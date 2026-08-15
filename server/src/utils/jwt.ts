import jwt, { SignOptions } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TTL = process.env.JWT_ACCESS_TTL || "12h";

export type JwtPayload =
  | { role: "ADMIN"; userId: string }
  | { role: "PLAYER"; teamId: string };

export function signToken(payload: JwtPayload, opts: SignOptions = {}): string {
  return jwt.sign(payload, SECRET, { expiresIn: TTL, ...opts });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
