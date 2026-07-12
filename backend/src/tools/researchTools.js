import { tool } from "@langchain/core/tools";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";

const WIKI_API = "https://en.wikipedia.org/api/rest_v1/page/summary";
const yahooFinance = new YahooFinance();
try {
  yahooFinance.suppressNotices(["yahooSurvey", "queue"]);
} catch (_) {}

const COMMON_TICKERS = {
  APPLE: "AAPL",
  TESLA: "TSLA",
  MICROSOFT: "MSFT",
  GOOGLE: "GOOGL",
  ALPHABET: "GOOGL",
  AMAZON: "AMZN",
  META: "META",
  FACEBOOK: "META",
  NETFLIX: "NFLX",
  NVIDIA: "NVDA",
  RELIANCE: "RELIANCE.NS",
  "RELIANCE INDUSTRIES": "RELIANCE.NS",
  RELIANCEINDUSTRIES: "RELIANCE.NS",
  INFOSYS: "INFY",
  TATA: "TCS.NS",
  "TATA CONSULTANCY": "TCS.NS",
  TATACONSULTANCY: "TCS.NS",
  WIPRO: "WIPRO.NS",
  HDFC: "HDFCBANK.NS",
  "HDFC BANK": "HDFCBANK.NS",
  ICICI: "ICICIBANK.NS",
  "ICICI BANK": "ICICIBANK.NS",
};

function withTimeout(promise, ms, errorMessage = "Request timed out") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function googleNewsSearch(query, maxResults = 5) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url, {
      headers: { "User-Agent": "InvestmentResearchBot/1.0" },
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const results = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && results.length < maxResults) {
      const block = match[1];
      const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim();
      if (title && !title.includes("Google News")) {
        results.push({
          title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"'),
          snippet: source ? `Source: ${source}` : "Recent news headline",
          source: "Google News",
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function duckDuckGoHtmlSearch(query, maxResults = 5) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const results = [];

    const blockRegex = /<div class="result[^"]*result--html[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
    const blocks = html.match(blockRegex) || [];

    for (const block of blocks) {
      if (results.length >= maxResults) break;
      const titleMatch = block.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

      if (titleMatch && snippetMatch) {
        const title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
        const snippet = snippetMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
        if (title && snippet && !title.includes("DuckDuckGo")) {
          results.push({ title, snippet, source: "DuckDuckGo Web" });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function wikipediaFullTextSearch(query, maxResults = 3) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "InvestmentResearchBot/1.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.query?.search ?? []).map((s) => ({
      title: s.title,
      snippet: s.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
      source: "Wikipedia Search",
    }));
  } catch {
    return [];
  }
}

async function duckDuckGoInstantSearch(query, maxResults = 3) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];

    const data = await response.json();
    const results = [];

    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        source: data.AbstractSource || "DuckDuckGo",
      });
    }

    for (const topic of data.RelatedTopics ?? []) {
      if (results.length >= maxResults) break;
      if (topic.Text) {
        results.push({
          title: topic.Text.split(" - ")[0],
          snippet: topic.Text,
          source: "DuckDuckGo",
        });
      }
    }

    return results.slice(0, maxResults);
  } catch {
    return [];
  }
}

async function webSearch(query, maxResults = 5) {
  // Try all search engines concurrently so first request is ultra-fast and never blocked by one slow engine
  const [ddgHtmlRes, wikiRes, ddgInstantRes, newsRes] = await Promise.allSettled([
    duckDuckGoHtmlSearch(query, maxResults),
    wikipediaFullTextSearch(query, 3),
    duckDuckGoInstantSearch(query, 3),
    googleNewsSearch(query, 3),
  ]);

  const ddgHtml = ddgHtmlRes.status === "fulfilled" ? ddgHtmlRes.value : [];
  const wikiSearch = wikiRes.status === "fulfilled" ? wikiRes.value : [];
  const ddgInstant = ddgInstantRes.status === "fulfilled" ? ddgInstantRes.value : [];
  const newsResults = newsRes.status === "fulfilled" ? newsRes.value : [];

  if (ddgHtml.length > 0) {
    const combined = [...ddgHtml, ...newsResults, ...wikiSearch, ...ddgInstant];
    return Array.from(new Map(combined.map(r => [r.title + r.snippet, r])).values()).slice(0, maxResults);
  }

  const combined = [...wikiSearch, ...ddgInstant, ...newsResults];
  if (combined.length > 0) {
    return Array.from(new Map(combined.map(r => [r.title + r.snippet, r])).values()).slice(0, maxResults);
  }

  // If complex multi-word query returned 0 results, try a simplified query concurrently
  const words = query.trim().split(/\s+/);
  if (words.length > 2) {
    const simpleQuery = `${words[0]} company`;
    const [simpleHtmlRes, simpleInstantRes] = await Promise.allSettled([
      duckDuckGoHtmlSearch(simpleQuery, maxResults),
      duckDuckGoInstantSearch(simpleQuery, maxResults),
    ]);
    const simpleHtml = simpleHtmlRes.status === "fulfilled" ? simpleHtmlRes.value : [];
    const simpleInstant = simpleInstantRes.status === "fulfilled" ? simpleInstantRes.value : [];
    const simpleCombined = [...simpleHtml, ...simpleInstant];
    if (simpleCombined.length > 0) {
      return Array.from(new Map(simpleCombined.map(r => [r.title + r.snippet, r])).values()).slice(0, maxResults);
    }
  }

  return [
    {
      title: query,
      status: "No direct web results found",
      snippet: `No direct web results found for '${query}'. Use Gemini's direct reasoning and world knowledge base to analyze '${words[0]}' if it is a known private company, startup, or regional entity.`,
    },
  ];
}

export const searchWeb = tool(
  async ({ query }) => {
    try {
      const results = await webSearch(query);
      return JSON.stringify(results, null, 2);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "search_web",
    description:
      "Search the web for recent news, financial reports, and company information. Use specific queries like 'Apple Q4 2024 earnings' or 'Tesla revenue growth'.",
    schema: z.object({
      query: z.string().describe("Search query about the company or topic"),
    }),
  }
);

export const getWikipediaSummary = tool(
  async ({ companyName }) => {
    try {
      const title = encodeURIComponent(companyName.replace(/ /g, "_"));
      const response = await fetch(`${WIKI_API}/${title}`, { signal: AbortSignal.timeout(6000) });

      if (!response.ok) {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(companyName)}&limit=1&format=json`;
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
        const [, titles] = await searchRes.json();
        
        // Check if opensearch returned a genuinely relevant title matching the company name
        const cleanReq = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanMatched = titles && titles.length > 0 ? titles[0].toLowerCase().replace(/[^a-z0-9]/g, "") : "";
        const isMatch = cleanMatched && (cleanMatched.includes(cleanReq) || cleanReq.includes(cleanMatched) || cleanMatched.startsWith(cleanReq));

        if (!titles?.length || !isMatch) {
          // Fallback: try DuckDuckGo HTML / Instant for company info
          const ddgHtml = await duckDuckGoHtmlSearch(`${companyName} company overview`, 3);
          if (ddgHtml.length > 0) {
            return JSON.stringify({
              title: companyName,
              description: "Company overview from web search (Wikipedia unavailable)",
              extract: ddgHtml.map(r => `${r.title}: ${r.snippet}`).join(" | "),
              url: null,
              source: "DuckDuckGo Web Search",
            });
          }
          const ddgResults = await duckDuckGoInstantSearch(`${companyName} company`, 2);
          if (ddgResults.length > 0) {
            return JSON.stringify({
              title: companyName,
              description: "Company information from web search",
              extract: ddgResults.map(r => r.snippet).join(" "),
              url: null,
              source: "DuckDuckGo (Wikipedia not found)",
            });
          }
          return JSON.stringify({
            title: companyName,
            status: "Private or Small Company (Not listed on Wikipedia)",
            note: `No specific Wikipedia article found for '${companyName}'. Do NOT confuse this company with generic terms or similarly named topics. Use Gemini's direct world knowledge and reasoning to evaluate this private/small entity.`
          });
        }
        const retry = await fetch(`${WIKI_API}/${encodeURIComponent(titles[0].replace(/ /g, "_"))}`, { signal: AbortSignal.timeout(6000) });
        if (!retry.ok) {
          return JSON.stringify({
            title: companyName,
            status: "Wikipedia lookup failed",
            note: `Use Gemini's direct world knowledge and reasoning to evaluate '${companyName}'.`
          });
        }
        const data = await retry.json();
        return JSON.stringify({
          title: data.title,
          description: data.description,
          extract: data.extract,
          url: data.content_urls?.desktop?.page,
        });
      }

      const data = await response.json();
      return JSON.stringify({
        title: data.title,
        description: data.description,
        extract: data.extract,
        url: data.content_urls?.desktop?.page,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message + ". Use search_web to gather company info instead." });
    }
  },
  {
    name: "get_wikipedia_summary",
    description:
      "Get a Wikipedia summary for a company — useful for business overview, history, and products.",
    schema: z.object({
      companyName: z.string().describe("Company name as listed on Wikipedia"),
    }),
  }
);

export const getStockData = tool(
  async ({ ticker, companyName }) => {
    let cleanTicker = (ticker || companyName || "").toUpperCase().trim();
    const upperKey = cleanTicker.replace(/\s+/g, " ").trim();
    const nospaceKey = cleanTicker.replace(/[^A-Z0-9]/g, "");

    if (COMMON_TICKERS[upperKey]) {
      cleanTicker = COMMON_TICKERS[upperKey];
    } else if (COMMON_TICKERS[nospaceKey]) {
      cleanTicker = COMMON_TICKERS[nospaceKey];
    }

    let quote = null;
    let summary = {};

    try {
      // If it doesn't look like a standard ticker or if quote fails, try yahooFinance search quickly
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          quote = await withTimeout(yahooFinance.quote(cleanTicker), 3500, "Yahoo Finance quote timeout");
          if (quote) break;
        } catch (err) {
          const isBlocked = err.status === 429 || err.message?.includes("429") || err.message?.includes("crumb") || err.message?.includes("redirect");
          if (isBlocked) {
            console.warn(`[StockData] Yahoo Finance blocked (429/crumb). Fast-forwarding directly to web fallback...`);
            throw err;
          }
          if (attempt === 0 && (!cleanTicker.includes(".") && cleanTicker.length > 5 || err.message?.includes("404"))) {
            try {
              const searchRes = await withTimeout(yahooFinance.search(companyName || cleanTicker), 3000, "Yahoo search timeout");
              if (searchRes?.quotes?.length > 0 && searchRes.quotes[0].symbol) {
                cleanTicker = searchRes.quotes[0].symbol;
                quote = await withTimeout(yahooFinance.quote(cleanTicker), 3500, "Yahoo quote timeout after search");
                if (quote) break;
              }
            } catch (_) {}
          }
          if (attempt === 1) throw err;
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (!quote) {
        throw new Error("No stock quote returned");
      }

      try {
        summary = await withTimeout(
          yahooFinance.quoteSummary(cleanTicker, {
            modules: [
              "summaryDetail",
              "financialData",
              "defaultKeyStatistics",
              "earningsTrend",
            ],
          }),
          3500,
          "Yahoo quoteSummary timeout"
        );
      } catch (summaryErr) {
        console.warn(`quoteSummary blocked or timed out for ${cleanTicker}:`, summaryErr.message);
      }

      const financial = summary.financialData ?? {};
      const keyStats = summary.defaultKeyStatistics ?? {};
      const detail = summary.summaryDetail ?? {};

      return JSON.stringify(
        {
          ticker: quote.symbol,
          name: quote.shortName ?? quote.longName,
          price: quote.regularMarketPrice,
          currency: quote.currency,
          marketCap: quote.marketCap,
          peRatio: detail.trailingPE ?? keyStats.trailingPE ?? quote.trailingPE ?? (quote.regularMarketPrice && quote.epsTrailingTwelveMonths ? +(quote.regularMarketPrice / quote.epsTrailingTwelveMonths).toFixed(2) : "Extract from web search"),
          forwardPE: detail.forwardPE ?? keyStats.forwardPE ?? quote.forwardPE ?? "Extract from web search",
          dividendYield: detail.dividendYield ?? quote.trailingAnnualDividendYield ?? "N/A",
          fiftyTwoWeekRange: {
            low: quote.fiftyTwoWeekLow,
            high: quote.fiftyTwoWeekHigh,
          },
          revenueGrowth: financial.revenueGrowth ?? keyStats.revenueGrowth ?? "Extract from web search",
          profitMargins: financial.profitMargins ?? keyStats.profitMargins ?? "Extract from web search",
          operatingMargins: financial.operatingMargins ?? keyStats.operatingMargins ?? "Extract from web search",
          netIncome: financial.netIncomeToCommon ?? (quote.epsTrailingTwelveMonths && quote.sharesOutstanding ? +(quote.epsTrailingTwelveMonths * quote.sharesOutstanding).toFixed(0) : "Extract from web search"),
          returnOnEquity: financial.returnOnEquity ?? "N/A",
          debtToEquity: financial.debtToEquity ?? "N/A",
          currentRatio: financial.currentRatio ?? "N/A",
          recommendation: financial.recommendationKey ?? "N/A",
          targetMeanPrice: financial.targetMeanPrice ?? "N/A",
          freeCashflow: financial.freeCashflow ?? "N/A",
        },
        null,
        2
      );
    } catch (error) {
      console.warn(`Yahoo Finance failed for ${cleanTicker}: ${error.message}. Attempting fast web fallback...`);

      try {
        const fallbackResults = await withTimeout(
          webSearch(`${cleanTicker} stock price market cap PE ratio revenue 2024 2025`, 3),
          4000,
          "Stock web search fallback timed out"
        );

        if (fallbackResults && fallbackResults.length > 0 && !fallbackResults[0]?.snippet?.includes("Limited web results") && !fallbackResults[0]?.snippet?.includes("No direct web results")) {
          return JSON.stringify({
            ticker: cleanTicker,
            name: cleanTicker,
            source: "Web Search Fallback (Yahoo Finance unavailable)",
            webData: fallbackResults.map((r) => `${r.title}: ${r.snippet}`).join("\n"),
            note: "Stock data fetched from web search. Numbers may be approximate. Extract specific metrics from the webData field above.",
          });
        }
      } catch (fallbackErr) {
        console.warn("Web fallback also failed:", fallbackErr.message);
      }

      return JSON.stringify({
        ticker: cleanTicker,
        status: "Private, Unlisted, or Startup Company (No public stock quote)",
        note: `No public stock ticker or financial quote found on Yahoo Finance for '${cleanTicker}'. This indicates a private, small, unlisted company, or startup. Do NOT hallucinate public stock metrics like market cap or P/E ratio. Use Gemini's direct reasoning and world knowledge to evaluate as a private investment.`
      });
    }
  },
  {
    name: "get_stock_data",
    description:
      "Fetch live stock quote and key financial metrics from Yahoo Finance. Requires a valid stock ticker (e.g. AAPL, MSFT, RELIANCE.NS for NSE).",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol"),
      companyName: z.string().optional().describe("Company name for fallback search"),
    }),
  }
);

export const researchTools = [searchWeb, getWikipediaSummary, getStockData];

export const toolsByName = Object.fromEntries(
  researchTools.map((t) => [t.name, t])
);

export async function warmupTools() {
  console.log("[Warmup] Initializing search engines, DNS connections & Yahoo Finance crumb cache...");
  try {
    yahooFinance.quote("AAPL").catch(() => {});
    Promise.allSettled([
      fetch("https://en.wikipedia.org/api/rest_v1/page/summary/Apple", { signal: AbortSignal.timeout(3500) }),
      fetch("https://html.duckduckgo.com/html/?q=Apple", { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(3500) }),
      fetch("https://news.google.com/rss/search?q=Apple", { signal: AbortSignal.timeout(3500) }),
    ]).catch(() => {});
  } catch (_) {}
}


