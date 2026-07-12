import "dotenv/config";

// Workaround for SSL proxy/antivirus intercepting HTTPS with self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import express from "express";
import cors from "cors";
import researchRouter from "./routes/research.js";
import { warmupTools } from "./tools/researchTools.js";
import { warmupAI } from "./agent/graph.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GOOGLE_API_KEY),
  });
});

app.use("/api/research", researchRouter);

app.listen(PORT, () => {
  console.log(`Investment Research Agent API running on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("Warning: GOOGLE_API_KEY not set. Copy .env.example to .env");
  } else {
    // Warm up tools, DNS connections, Yahoo Finance crumb cache and Gemini TLS sessions immediately on startup
    warmupTools();
    warmupAI();
  }
});
// Server initialized


