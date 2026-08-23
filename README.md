# NEXUS — Operation Steal The Code

Full-stack heist game for a college tech-club induction event. ~150 freshers, 15 teams, 3 missions, 30 minutes.

- **Backend:** Express 5 + TypeScript + Prisma + PostgreSQL, JWT auth
- **Frontend:** React 18 + Vite + TS, Tailwind v4, shadcn/ui, Framer Motion (player/admin) + GSAP (projector)
- **Realtime:** simple polling (no websockets)

## Quick start

```bash
# 1. Bring up Postgres
docker compose up -d

# 2. Server
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev            # http://localhost:4000

# 3. Client (in a second terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```

## Routes

- `/admin/login` — admin login
- `/admin` — admin dashboard (game control, teams, missions, leaderboard, activity)
- `/play?team=<CODE>` — player game (mobile-first)
- `/projector` — projector display (landscape, fullscreen)

## First-time setup

1. `POST /api/auth/admin/register` is open until the first admin exists. Create one:
   ```bash
   curl -X POST http://localhost:4000/api/auth/admin/register \
     -H "content-type: application/json" \
     -d '{"email":"admin@nexus.local","password":"nexus123"}'
   ```
2. Log in at `/admin/login`, create 15 teams from the Teams tab, print the QR sheet.
3. Hit **START** on Game Control when everyone's ready.

## Master key (default seed)

`7291` — computed from fragment digits in mission order: 7, 2, 9, 1. The fourth fragment is obtained directly from the insider. Admin can edit fragment values per challenge; the master key auto-recomputes.


