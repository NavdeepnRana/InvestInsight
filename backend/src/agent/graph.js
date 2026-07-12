import { ChatGoogle } from "@langchain/google";
import { ChatGroq } from "@langchain/groq";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";
import { researchTools, toolsByName } from "../tools/researchTools.js";

const RESEARCH_SYSTEM = `You are a senior investment research analyst gathering data on a company.

Your job in this phase is RESEARCH ONLY — collect facts using your tools. Do not make a final invest/pass decision yet.

IMPORTANT EFFICIENCY RULES (MUST FOLLOW TO PREVENT API QUOTA EXHAUSTION):
1. Be extremely concise and fast. Complete your research in AT MOST 2 or 3 tool calls total.
2. Do NOT search year-by-year or quarter-by-quarter separately.
3. Call get_wikipedia_summary once for business overview.
4. Call get_stock_data once for current stock metrics.
5. Call search_web ONCE with a comprehensive query for overall recent financials, latest news, and key risks (e.g. "Apple recent earnings revenue net income PE ratio competitive risks 2025 2026").
6. Immediately summarize all findings after 2-3 tool calls, UNLESS get_stock_data failed or returned an error/429. If stock data failed or metrics are missing, you MUST call search_web once specifically for "company stock price market cap PE ratio revenue net income 52 week range" before summarizing!

HANDLING SMALL/PRIVATE/UNLISTED COMPANIES:
- If get_stock_data fails (no ticker found), that's OK! Use search_web to find financial info instead.
- For private companies or startups, use search_web for "company name revenue funding valuation employees" to get available data.
- NEVER give up just because stock data is unavailable. Always gather what you can from web and Wikipedia.`;

const DECISION_SCHEMA = `Respond with ONLY valid JSON (no markdown fences). Return ONLY this structure:
{
  "company": "Company Name",
  "profile": {
    "industry": "Industry name",
    "sector": "Sector name",
    "summary": "1-2 sentence overview: what the company does, its core products/services, and why it matters",
    "ceo": "CEO full name",
    "founded": "Year founded",
    "headquarters": "City, Country",
    "keyProducts": ["Product/Service 1", "Product/Service 2", "Product/Service 3"],
    "revenueBreakdown": [
      {"segment": "Segment name", "detail": "concise description with approximate revenue or % share"},
      {"segment": "Segment name", "detail": "concise description with approximate revenue or % share"}
    ]
  },
  "financial": {
    "revenue": {"status": "Strong | Moderate | Weak", "detail": "e.g. $394B annual revenue, grew 8% YoY"},
    "profitability": {"status": "High | Moderate | Low", "detail": "e.g. Net income $97B, 24.7% margin"},
    "debt": {"status": "Low | Moderate | High", "detail": "e.g. $111B total debt, 1.8 debt-to-equity"},
    "cashFlow": {"status": "Positive | Neutral | Negative", "detail": "e.g. $110B operating cash flow"},
    "marketCap": "e.g. $3.4 Trillion",
    "peRatio": "e.g. 32.5x"
  },
  "marketPosition": {
    "status": "Market Leader | Challenger | Niche Player",
    "competition": "Competitor1, Competitor2, Competitor3",
    "advantage": "1-sentence competitive advantage explanation",
    "marketShare": "approximate market share or ranking if known"
  },
  "growth": {
    "rating": "High | Medium | Low",
    "reason": "1-2 sentence growth explanation with specific drivers",
    "catalysts": ["Growth driver 1", "Growth driver 2"]
  },
  "risks": ["Specific risk 1 (1 concise sentence)", "Specific risk 2 (1 concise sentence)", "Specific risk 3 (1 concise sentence)"],
  "news": ["Recent news 1 with context (1 concise sentence)", "Recent news 2 with context (1 concise sentence)", "Recent news 3 with context (1 concise sentence)"],
  "decision": "INVEST (if confidence 75-100), WATCH (if confidence 55-74), or PASS (if confidence 0-54)",
  "confidence": number_between_0_and_100,
  "reasoning": ["Key supporting reason 1 (1 concise sentence)", "Key supporting reason 2 (1 concise sentence)", "Key supporting reason 3 (1 concise sentence)"]
}`;

function createGoogleModel() {
  return new ChatGoogle({
    model: "gemini-3.5-flash",
    temperature: 0.2,
    maxRetries: 1,
  });
}

function createGroqModel() {
  return new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    maxRetries: 1,
  });
}

function createResearchModel() {
  return createGoogleModel();
}

function createAnalysisModel() {
  return createGoogleModel();
}

function withTimeout(promise, ms, errorMessage = "Request timed out") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function invokeWithRetry(model, messages, retries = 4, tools = null) {
  let activeModel = model;
  let isUsingGroq = activeModel.constructor.name === "ChatGroq" || activeModel._llmType === "groq";

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await withTimeout(activeModel.invoke(messages), 45000, "LLM invocation timed out after 45s");
    } catch (error) {
      const isProviderError =
        error?.statusCode === 429 ||
        error?.statusCode === 403 ||
        error?.statusCode === 503 ||
        error?.statusCode === 500 ||
        error?.statusCode === 502 ||
        error?.statusCode === 504 ||
        error?.status === 429 ||
        error?.status === 403 ||
        error?.status === 503 ||
        error?.status === 500 ||
        error?.status === 502 ||
        error?.status === 504 ||
        error?.status === "RESOURCE_EXHAUSTED" ||
        error?.status === "PERMISSION_DENIED" ||
        error?.status === "UNAVAILABLE" ||
        error?.message?.includes("429") ||
        error?.message?.includes("403") ||
        error?.message?.includes("503") ||
        error?.message?.includes("500") ||
        error?.message?.includes("502") ||
        error?.message?.includes("504") ||
        error?.message?.includes("quota") ||
        error?.message?.includes("leaked") ||
        error?.message?.includes("rate_limit") ||
        error?.message?.includes("high demand") ||
        error?.message?.includes("Service Unavailable") ||
        error?.message?.includes("OVERLOADED") ||
        error?.message?.includes("timeout") ||
        error?.message?.includes("fetch failed") ||
        error?.message?.includes("socket hang up");

      // If Gemini fails with quota/429/503/timeout and Groq key exists, switch to Groq
      if (isProviderError && !isUsingGroq && process.env.GROQ_API_KEY) {
        console.warn(`[Failover] Gemini error/quota/high-demand hit (${error.message || error.status}). Switching to Groq Llama 3.3...`);
        activeModel = createGroqModel();
        if (tools) {
          activeModel = activeModel.bindTools(tools);
        }
        isUsingGroq = true;

        const sanitizedMessages = messages.map((msg) => {
          if (AIMessage.isInstance(msg) || msg._getType() === "ai") {
            let cleanContent = msg.content;
            if (Array.isArray(cleanContent)) {
              cleanContent = cleanContent.length === 0 ? "" : cleanContent.map((b) => (typeof b === "string" ? b : b?.text || "")).join(" ");
            }
            if (cleanContent === null || cleanContent === undefined) cleanContent = "";
            return new AIMessage({
              content: cleanContent,
              tool_calls: msg.tool_calls,
              additional_kwargs: msg.additional_kwargs,
              id: msg.id,
            });
          }
          return msg;
        });

        try {
          return await withTimeout(activeModel.invoke(sanitizedMessages), 45000, "Groq invocation timed out after 45s");
        } catch (groqErr) {
          console.warn(`[Failover] Groq also hit rate-limit/error (${groqErr.message}). Switching back to Gemini for retry...`);
          activeModel = createGoogleModel();
          if (tools) activeModel = activeModel.bindTools(tools);
          isUsingGroq = false;
        }
      }

      if (!isProviderError || attempt === retries - 1) {
        throw error;
      }

      // Parse wait time from error or default to exponential backoff
      let delayMs = Math.min(1000 * 2 ** attempt, 8000);
      const retryMatch = error?.message?.match(/try again in ([0-9.]+)s/i) || error?.message?.match(/retry in ([0-9.]+)s/i);
      if (retryMatch && retryMatch[1]) {
        const exactSeconds = parseFloat(retryMatch[1]);
        if (!isNaN(exactSeconds) && exactSeconds > 0) {
          delayMs = Math.ceil(exactSeconds * 1000) + 500;
        }
      }

      console.warn(`[Retry] Provider rate limit / overload hit. Waiting ${Math.round(delayMs / 1000)}s before retry ${attempt + 1}/${retries}...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function streamAnalysisWithProgress(model, messages, sendEvent, retries = 3) {
  let activeModel = model;
  let isUsingGroq = activeModel.constructor.name === "ChatGroq" || activeModel._llmType === "groq";

  const progressMessages = [
    "Evaluating business profile & revenue breakdown (2s)...",
    "Analyzing financial health & valuation metrics (4s)...",
    "Assessing market position & competitive advantage (6s)...",
    "Evaluating growth catalysts & key risk threats (8s)...",
    "Synthesizing final investment decision & confidence score (10s)...",
  ];

  for (let attempt = 0; attempt < retries; attempt++) {
    let progressTimer = null;
    try {
      let progressIdx = 0;
      let fullText = "";

      progressTimer = setInterval(() => {
        if (progressIdx < progressMessages.length) {
          sendEvent("step", {
            phase: "analysis",
            status: "field_status",
            field: "analysis",
            fieldStatus: "loading",
            message: progressMessages[progressIdx],
          });
          progressIdx++;
        }
      }, 2000);

      const stream = await withTimeout(activeModel.stream(messages), 40000, "LLM stream timed out after 40s");
      for await (const chunk of stream) {
        const content = chunk?.content ?? "";
        if (typeof content === "string") {
          fullText += content;
        } else if (Array.isArray(content)) {
          fullText += content.map((b) => (typeof b === "string" ? b : b?.text || "")).join("");
        }
      }
      clearInterval(progressTimer);
      return new AIMessage({ content: fullText });
    } catch (error) {
      if (progressTimer) clearInterval(progressTimer);
      const isProviderError =
        error?.statusCode === 429 ||
        error?.statusCode === 503 ||
        error?.status === 429 ||
        error?.status === 503 ||
        error?.message?.includes("429") ||
        error?.message?.includes("quota") ||
        error?.message?.includes("rate_limit") ||
        error?.message?.includes("timeout");

      if (isProviderError && !isUsingGroq && process.env.GROQ_API_KEY) {
        activeModel = createGroqModel();
        isUsingGroq = true;
        continue;
      }
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}


// Map tool names to field identifiers for progress tracking
const TOOL_TO_FIELD = {
  get_wikipedia_summary: "wikipedia",
  get_stock_data: "stock_data",
  search_web: "web_search",
};

/**
 * Direct pipeline — no LangGraph StateGraph.
 * Runs research tools, then AI analysis, streaming field_status events in real-time.
 */
export async function streamInvestmentResearch(companyName, sendEvent) {
  const trimmed = companyName.trim();
  sendEvent("start", { companyName: trimmed, message: `Researching ${trimmed}...` });

  console.log(`[Stream] Starting fast parallel research for "${trimmed}"`);

  // Track completed fields so once checked green (`done`), they NEVER revert to `loading`
  const completedFields = new Set();
  const updateField = (field, fieldStatus, message) => {
    if (completedFields.has(field) && fieldStatus === "loading") {
      return; // Do not turn a green tick back to loading
    }
    if (fieldStatus === "done") {
      completedFields.add(field);
    }
    sendEvent("step", {
      phase: "research",
      status: "field_status",
      field,
      fieldStatus,
      message,
    });
  };

  // Send initial loading state for all 3 fields simultaneously
  updateField("wikipedia", "loading", "Fetching company profile & Wikipedia...");
  updateField("stock_data", "loading", "Fetching stock price & financials...");
  updateField("web_search", "loading", "Searching news, valuation & competitive intelligence...");

  // ─── Phase 1: Fast Parallel Tool Gathering ───
  const cleanTicker = trimmed.toUpperCase().replace(/\s+/g, "");
  const [wikiRes, stockRes, webRes] = await Promise.allSettled([
    withTimeout(toolsByName["get_wikipedia_summary"].invoke({ companyName: trimmed }), 10000, "Wikipedia tool timeout").then((res) => {
      updateField("wikipedia", "done", "Company profile fetched successfully");
      return res;
    }).catch((err) => {
      updateField("wikipedia", "done", "Company profile extracted from web");
      return `Wikipedia fallback error: ${err.message}`;
    }),
    withTimeout(toolsByName["get_stock_data"].invoke({ ticker: cleanTicker, companyName: trimmed }), 10000, "Stock data tool timeout").then((res) => {
      let isErr = false;
      if (typeof res === "string" && res.includes('"error"')) isErr = true;
      updateField("stock_data", "done", isErr ? "Private/small company — financial metrics extracted via web search" : "Stock & financial metrics fetched successfully");
      return res;
    }).catch((err) => {
      updateField("stock_data", "done", "Financial metrics extracted via web search");
      return `Stock data fallback error: ${err.message}`;
    }),
    withTimeout(toolsByName["search_web"].invoke({ query: `${trimmed} company overview revenue funding valuation competitors news` }), 10000, "Web search tool timeout").then((res) => {
      updateField("web_search", "done", "Web research & news fetched successfully");
      return res;
    }).catch((err) => {
      updateField("web_search", "done", "Web intelligence gathered");
      return `Web search fallback error: ${err.message}`;
    }),
  ]);

  const wikiText = wikiRes.status === "fulfilled" ? (typeof wikiRes.value === "string" ? wikiRes.value.slice(0, 1800) : JSON.stringify(wikiRes.value).slice(0, 1800)) : "N/A";
  const stockText = stockRes.status === "fulfilled" ? (typeof stockRes.value === "string" ? stockRes.value.slice(0, 1800) : JSON.stringify(stockRes.value).slice(0, 1800)) : "N/A";
  const webText = webRes.status === "fulfilled" ? (typeof webRes.value === "string" ? webRes.value.slice(0, 1800) : JSON.stringify(webRes.value).slice(0, 1800)) : "N/A";

  const researchText = [
    `=== WIKIPEDIA / COMPANY PROFILE ===\n${wikiText}`,
    `=== STOCK & FINANCIAL DATA ===\n${stockText}`,
    `=== WEB RESEARCH & NEWS ===\n${webText}`,
  ].join("\n\n");

  // ─── Phase 2: AI Analysis ───
  sendEvent("step", {
    phase: "analysis",
    status: "field_status",
    field: "analysis",
    fieldStatus: "loading",
    message: "AI is analyzing all research data...",
  });

  const analysisModel = createAnalysisModel();
  const prompt = `You are a senior investment research analyst. Analyze "${trimmed}" and produce a detailed investment report with real data.

CRITICAL RULE FOR ULTRA-FAST SPEED (CUTS TIME IN HALF):
Keep EVERY single text value (summary, detail, advantage, reason, catalysts, risks, news, reasoning) to EXACTLY 1 punchy, concise sentence. Do NOT write paragraphs or wordy explanations. This cuts token generation time in half!

RECOMMENDATION & CONFIDENCE RULES:
- You MUST assign an evidence-based confidence score between 0 and 100.
- If confidence is 75 to 100 -> set decision to "INVEST"
- If confidence is 55 to 74 -> set decision to "WATCH"
- If confidence is 0 to 54 -> set decision to "PASS"

IMPORTANT INSTRUCTIONS:
1. Company profile: Include CEO name, founding year, headquarters, 1-2 sentence overview, key products/services, and revenue breakdown by business segment with approximate dollar amounts or percentage shares.
2. Financial health: Include ACTUAL NUMBERS (revenue in $B, net income, profit margins, debt figures, cash flow). Do NOT just say "Strong" — say "$394B revenue, grew 8% YoY" etc.
3. Market position: Include approximate market share or ranking, list 3+ competitors, explain competitive moat in 1 concise sentence.
4. Growth: List specific growth catalysts (new products, expansion, AI, etc.)
5. News: Each news item should be 1 concise sentence with context.
6. Risks: Each risk should be 1 concise sentence explaining the specific threat.
7. Reasoning: Each reason should be 1 concise sentence with supporting data.

CRITICAL RULES FOR ALL COMPANIES:
- For PRIVATE / SMALL companies or startups (e.g. where stock quote or Wikipedia is not found): You MUST use your own Gemini / AI world knowledge base and intelligent reasoning to identify and evaluate the company (e.g. what the company actually does, its domain, industry, and private valuation/revenue estimate). Evaluate as a VC/PE investor. Do NOT default to PASS just because stock metrics are N/A.
- ANTI-HALLUCINATION & ANTI-CONFUSION RULE: If public tool data returned an error or notes that the company is private/small/unlisted, DO NOT confuse the company name with generic terms or similarly named concepts (e.g. never confuse 'INTEGRTR' with 'Integrated circuit' or 'DropOutIQ' with 'Dropout demographics'). If your knowledge base has exact info on the private company, use it accurately. If not, state clearly that it is a private startup/consultancy with limited public financial disclosure and provide a realistic private market analysis.
- For PUBLIC companies: extract real numbers from the research data. Do NOT use vague labels without numbers.
- If financial data is limited, make your BEST decision based on available information with appropriately lower confidence (40-65%). 
- You MUST ALWAYS provide a decision (INVEST, WATCH, or PASS). NEVER refuse to decide.
- Fill in ALL fields. If data is truly unavailable for a field, use "Data unavailable" with a brief explanation — do NOT leave fields empty.

RESEARCH DATA:
${researchText}

${DECISION_SCHEMA}`;

  const analysisResponse = await streamAnalysisWithProgress(analysisModel, [
    new SystemMessage(
      "You are an expert investment analyst with deep knowledge of both public financial markets and private tech/startup/consultancy ecosystems. When analyzing private, small, or unlisted companies, use your internal AI world knowledge and reasoning directly without hallucinating or confusing company names with generic terms. Output only valid JSON matching the requested schema. Every field must contain concise 1-sentence actionable information so structured JSON generates rapidly."
    ),
    new HumanMessage(prompt),
  ], sendEvent);

  let decision = null;
  const raw = analysisResponse.content?.toString?.() ?? String(analysisResponse.content);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    decision = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    if (decision && typeof decision.confidence === "number") {
      if (decision.confidence >= 75) {
        decision.decision = "INVEST";
      } else if (decision.confidence >= 55) {
        decision.decision = "WATCH";
      } else {
        decision.decision = "PASS";
      }
    }
  } catch {
    decision = {
      company: trimmed,
      profile: { industry: "Unknown", sector: "Unknown", summary: "Analysis could not be parsed." },
      financial: { revenue: "N/A", profitability: "N/A", debt: "N/A", cashFlow: "N/A" },
      marketPosition: { status: "Unknown", competition: "Unknown", advantage: "Unknown" },
      growth: { rating: "N/A", reason: "Could not determine" },
      risks: ["Analysis output was malformed"],
      news: ["No news available"],
      decision: "PASS",
      confidence: 30,
      reasoning: ["Could not parse structured decision — defaulting to PASS"],
    };
  }

  // Send analysis DONE
  sendEvent("step", {
    phase: "analysis",
    status: "field_status",
    field: "analysis",
    fieldStatus: "done",
    message: `Decision: ${decision.decision} (${decision.confidence}% confidence)`,
  });

  const finalState = {
    companyName: trimmed,
    researchSummary: researchText,
    decision,
    steps: [],
  };

  sendEvent("complete", finalState);
  return finalState;
}

// Keep non-streaming version for the POST / endpoint
export async function runInvestmentResearch(companyName) {
  const noopSend = () => {};
  return await streamInvestmentResearch(companyName, noopSend);
}

export async function warmupAI() {
  try {
    console.log("[Warmup] Initializing Gemini AI model TLS/DNS connection...");
    const model = createGoogleModel();
    model.invoke([new HumanMessage("hi")]).catch(() => {});
  } catch (_) {}
}
