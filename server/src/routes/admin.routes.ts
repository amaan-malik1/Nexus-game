import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import {
  getGame,
  patchGame,
  resetGame,
  listTeams,
  createTeam,
  deleteTeam,
  adjustScore,
  approveMission,
  qrForTeam,
  qrSheet,
  listMissions,
  createMission,
  updateMission,
  deleteMission,
  addChallenge,
  updateChallenge,
  deleteChallenge,
  activityFeed,
  adminLeaderboard,
} from "../controllers/admin.controller.js";

const r = Router();
r.use(requireAdmin);

// Game
r.get("/game", getGame);
r.patch("/game", patchGame);
r.post("/game/reset", resetGame);

// Teams
r.get("/teams", listTeams);
r.post("/teams", createTeam);
r.delete("/teams/:id", deleteTeam);
r.patch("/teams/:id/score", adjustScore);
r.post("/teams/:id/approve-mission", approveMission);
r.get("/teams/:id/qr", qrForTeam);
r.get("/teams/qr-sheet", qrSheet);

// Missions
r.get("/missions", listMissions);
r.post("/missions", createMission);
r.put("/missions/:id", updateMission);
r.delete("/missions/:id", deleteMission);
r.post("/missions/:id/challenges", addChallenge);
r.put("/challenges/:id", updateChallenge);
r.delete("/challenges/:id", deleteChallenge);

// Feed & leaderboard
r.get("/activity", activityFeed);
r.get("/leaderboard", adminLeaderboard);

export default r;
