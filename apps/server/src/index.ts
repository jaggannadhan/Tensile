import express from "express";
import cors from "cors";
import path from "node:path";
import { runsRouter } from "./routes/runs.js";
import { filesRouter } from "./routes/files.js";
import { pinnedRouter } from "./routes/pinned.js";
import { registry } from "./registry.js";
import { scanProjects, listProjects } from "./projects.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const SERVER_DIR = new URL(".", import.meta.url).pathname;
const DATA_DIR = path.resolve(SERVER_DIR, "../../../data/runs");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", runs: registry.size() });
});

// Projects endpoints
app.get("/api/projects", (_req, res) => {
  res.json(listProjects());
});

app.get("/api/projects/:slug/runs", (req, res) => {
  res.json(registry.listByProject(req.params.slug as string));
});

// API routes
app.use("/api/runs", runsRouter);
app.use("/api/projects/:slug/pinned-tests", pinnedRouter);

// Static file serving for run artifacts
app.use("/runs", filesRouter);

// Scan existing runs on startup, then listen
scanProjects(DATA_DIR)
  .then(() => {
    const restoredCount = registry.size();
    if (restoredCount > 0) {
      console.log(`Restored ${restoredCount} run(s) from disk`);
    }
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.warn("Failed to scan projects on startup:", (err as Error).message);
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  });
