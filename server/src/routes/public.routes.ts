import { Router } from "express";
import { prisma } from "../services/game.service.js";
import { qrPngBuffer, qrPngDataUrl, playUrlFor } from "../services/qr.service.js";

const r = Router();

// PNG QR by team code — public so <img src> and new tabs work
r.get("/teams/:code/qr", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const team = await prisma.team.findUnique({ where: { code } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  const buf = await qrPngBuffer(team.code);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Disposition", `inline; filename="${team.code}.png"`);
  res.send(buf);
});

// Printable HTML sheet — public. Any admin/staff can just open this URL and Ctrl-P.
r.get("/qr-sheet", async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  const cards = await Promise.all(
    teams.map(async (t) => ({
      name: t.name,
      code: t.code,
      qr: await qrPngDataUrl(t.code),
      url: playUrlFor(t.code),
    })),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>NEXUS QR sheet</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: 'JetBrains Mono', ui-monospace, monospace; margin: 0; background: #fff; color: #0a0a0f; }
  h1 { font-family: 'Orbitron', sans-serif; letter-spacing: 4px; text-align:center; margin: 4mm 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .card { border: 1.5px dashed #0a0a0f; padding: 4mm; text-align: center; break-inside: avoid; border-radius: 4mm; }
  .name { font-weight: 700; letter-spacing: 2px; margin-bottom: 2mm; }
  .code { font-size: 11pt; letter-spacing: 3px; margin-top: 2mm; }
  img { width: 100%; max-width: 50mm; }
</style></head><body>
<h1>NEXUS · SCAN TO PLAY</h1>
<div class="grid">
${cards
  .map(
    (c) => `<div class="card"><div class="name">${c.name}</div><img src="${c.qr}" alt="${c.code}"/><div class="code">${c.code}</div></div>`,
  )
  .join("")}
</div>
</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default r;
