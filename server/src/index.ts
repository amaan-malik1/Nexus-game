import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import gameRoutes from "./routes/game.routes.js";
import projectorRoutes from "./routes/projector.routes.js";
import publicRoutes from "./routes/public.routes.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN.split(","), credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "nexus", ts: Date.now() }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/projector", projectorRoutes);
app.use("/api/public", publicRoutes);

// Fallback error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 NEXUS server on http://localhost:${PORT}`);
});
