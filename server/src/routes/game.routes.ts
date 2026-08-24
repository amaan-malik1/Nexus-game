import { Router } from "express";
import { requirePlayer } from "../middleware/auth.js";
import {
  gameStatus,
  teamState,
  currentMission,
  submitAnswer,
  submitFragment,
  requestHint,
  requestAgentHint,
  listFragments,
  submitVault,
  publicLeaderboard,
} from "../controllers/game.controller.js";

const r = Router();

r.get("/status", gameStatus);              // public
r.get("/leaderboard", publicLeaderboard);  // public

r.get("/team", requirePlayer, teamState);
r.get("/mission", requirePlayer, currentMission);
r.post("/submit", requirePlayer, submitAnswer);
r.post("/fragment", requirePlayer, submitFragment);
r.post("/hint", requirePlayer, requestHint);
r.post("/agent-hint", requirePlayer, requestAgentHint);
r.get("/fragments", requirePlayer, listFragments);
r.post("/vault", requirePlayer, submitVault);

export default r;
