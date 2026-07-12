import { Router } from "express";
import { streamInvestmentResearch, runInvestmentResearch } from "../agent/graph.js";

const router = Router();

router.post("/", async (req, res) => {
  const { companyName } = req.body;

  if (!companyName?.trim()) {
    return res.status(400).json({ error: "companyName is required" });
  }

  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({
      error: "GOOGLE_API_KEY is not configured. Add it to backend/.env",
    });
  }

  try {
    const result = await runInvestmentResearch(companyName.trim());
    res.json(result);
  } catch (error) {
    console.error("Research error:", error);
    res.status(500).json({
      error: error.message ?? "Research failed",
    });
  }
});

router.post("/stream", async (req, res) => {
  const { companyName } = req.body;

  if (!companyName?.trim()) {
    return res.status(400).json({ error: "companyName is required" });
  }

  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({
      error: "GOOGLE_API_KEY is not configured. Add it to backend/.env",
    });
  }

  // Track if client disconnected from the response stream
  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
    console.log("Client disconnected from SSE stream");
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send initial comment to open connection and flush buffers through proxy
  try {
    res.write(": connected\n\n");
    if (typeof res.flush === "function") {
      res.flush();
    }
  } catch (_) {
    clientDisconnected = true;
  }

  const sendEvent = (event, data) => {
    if (clientDisconnected || res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Force flush for real-time delivery
      if (typeof res.flush === "function") {
        res.flush();
      }
    } catch {
      clientDisconnected = true;
    }
  };

  const heartbeat = setInterval(() => {
    if (clientDisconnected || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    sendEvent("ping", { time: Date.now() });
  }, 3000);

  // 120-second timeout to prevent hung connections under heavy model load
  const timeout = setTimeout(() => {
    clearInterval(heartbeat);
    if (!clientDisconnected) {
      sendEvent("error", { error: "Request timed out after 120 seconds. Please try again." });
      res.end();
    }
  }, 120000);

  try {
    await streamInvestmentResearch(companyName.trim(), sendEvent);
    clearTimeout(timeout);
    clearInterval(heartbeat);
    if (!clientDisconnected) {
      res.end();
    }
  } catch (error) {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    console.error("Stream error:", error);
    if (!clientDisconnected) {
      sendEvent("error", { error: error.message ?? "Research failed" });
      res.end();
    }
  }
});

export default router;
