import { Router } from "express";
import { projectorState } from "../controllers/projector.controller.js";

const r = Router();
r.get("/state", projectorState);
export default r;
