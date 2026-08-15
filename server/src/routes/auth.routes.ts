import { Router } from "express";
import {
  registerAdmin,
  loginAdmin,
  joinTeam,
  adminBootstrapStatus,
} from "../controllers/auth.controller.js";

const r = Router();

r.get("/admin/bootstrap-status", adminBootstrapStatus);
r.post("/admin/register", registerAdmin);
r.post("/admin/login", loginAdmin);
r.post("/team/join", joinTeam);

export default r;
