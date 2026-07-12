import { useState, useRef, useEffect } from "react";
import ResearchForm from "./components/ResearchForm";
import AnalysisProgress from "./components/AnalysisProgress";
import ResultsPanel from "./components/ResultsPanel";
import "./App.css";

const EXAMPLE_COMPANIES = ["InsideIIM", "Apple", "Tesla", "Reliance Industries", "Infosys", "NVIDIA"];

const DEFAULT_FIELD_STATUSES = {
  wikipedia: "waiting",
  stock_data: "waiting",
  web_search: "waiting",
  analysis: "waiting",
};

export default function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState("home"); // "home" | "analyzing" | "results"
  const [companySearched, setCompanySearched] = useState("");
  const [fieldStatuses, setFieldStatuses] = useState({ ...DEFAULT_FIELD_STATUSES });
  const [fieldMessages, setFieldMessages] = useState({});

  // Track whether we are still on the analysis page
  const activeRef = useRef(false);
  const readerRef = useRef(null);

  async function handleResearch(companyName) {
    // Stop any previous in-progress read
    activeRef.current = false;
    if (readerRef.current) {
      try { readerRef.current.cancel(); } catch (_) { }
      readerRef.current = null;
    }

    // Reset state
    setLoading(true);
    setResult(null);
    setError(null);
    setCompanySearched(companyName);
    setFieldStatuses({ ...DEFAULT_FIELD_STATUSES });
    setFieldMessages({});
    setPage("analyzing");

    // Mark this run as active
    activeRef.current = true;
    const controller = new AbortController();

    try {
      const res = await fetch("/api/research/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!activeRef.current) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // keep last incomplete piece

        for (const block of lines) {
          if (!block.trim() || block.startsWith(":")) continue;

          let eventType = "message";
          let dataStr = "";

          const blockLines = block.split("\n");
          for (const line of blockLines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr += line.slice(6);
            }
          }

          if (!dataStr) continue;

          let data;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (!activeRef.current) break;

          if (eventType === "step" && data.status === "field_status") {
            // Update individual field status and message in real-time
            setFieldStatuses((prev) => ({
              ...prev,
              [data.field]: data.fieldStatus,
            }));
            if (data.message) {
              setFieldMessages((prev) => ({
                ...prev,
                [data.field]: data.message,
              }));
            }
          } else if (eventType === "complete") {
            // All done — mark all green and go to results immediately
            setFieldStatuses({
              wikipedia: "done",
              stock_data: "done",
              web_search: "done",
              analysis: "done",
            });
            setResult(data);
            setLoading(false);
            // Ultra-fast transition to results
            setTimeout(() => {
              if (activeRef.current) setPage("results");
            }, 350);
            return;
          } else if (eventType === "error") {
            throw new Error(data.error);
          }
        }
      }
    } catch (err) {
      if (!activeRef.current) return; // Cancelled by user, ignore
      setError(err.message || "Something went wrong. Please try again.");
      setPage("home");
    } finally {
      if (activeRef.current) {
        setLoading(false);
      }
    }
  }

  function handleCancel() {
    activeRef.current = false;
    if (readerRef.current) {
      try { readerRef.current.cancel(); } catch (_) { }
      readerRef.current = null;
    }
    setLoading(false);
    setPage("home");
  }

  function handleNewResearch() {
    activeRef.current = false;
    if (readerRef.current) {
      try { readerRef.current.cancel(); } catch (_) { }
      readerRef.current = null;
    }
    setResult(null);
    setError(null);
    setCompanySearched("");
    setLoading(false);
    setFieldStatuses({ ...DEFAULT_FIELD_STATUSES });
    setPage("home");
  }

  return (
    <div className="app">
      {page === "home" && (
        <div className="page-enter">
          <header className="header">
            <div className="header-badge">InvestInsight</div>
            <h1>AI-Powered Investment Research Platform</h1>
            <p className="subtitle">
              Analyze any publicly listed company using AI-powered financial intelligence. Get comprehensive research, financial insights, risk analysis, competitive positioning, and an evidence-based investment recommendation in seconds.
            </p>
          </header>

          <main className="main">
            <ResearchForm
              onSubmit={handleResearch}
              loading={loading}
              examples={EXAMPLE_COMPANIES}
            />

            {error && (
              <div className="error-banner" role="alert">
                ⚠️ {error}
              </div>
            )}
          </main>
        </div>
      )}

      {page === "analyzing" && (
        <div className="page-enter">
          <div className="results-header">
            <button className="btn-back" onClick={handleCancel}>
              ← Cancel
            </button>
          </div>
          <AnalysisProgress
            companyName={companySearched}
            fieldStatuses={fieldStatuses}
            fieldMessages={fieldMessages}
          />
        </div>
      )}

      {page === "results" && result && (
        <div className="page-enter">
          <div className="results-header">
            <button className="btn-back" onClick={handleCancel}>
              ← Back
            </button>
            <div className="results-header-actions">
              <button className="btn-new" onClick={handleNewResearch}>
                + New Research
              </button>
            </div>
          </div>
          <ResultsPanel result={result} />
        </div>
      )}

      <footer className="footer">
        Built with React · Express · LangGraph.js · Google Gemini
      </footer>
    </div>
  );
}
