import "./ResultsPanel.css";

function FinancialItem({ label, data }) {
  // data can be a string (old format) or {status, detail} (new format)
  const status = typeof data === "object" ? data?.status : data;
  const detail = typeof data === "object" ? data?.detail : null;

  const colorMap = {
    Strong: "badge--green",
    High: "badge--green",
    Positive: "badge--green",
    Low: "badge--green",
    Moderate: "badge--yellow",
    Neutral: "badge--yellow",
    Medium: "badge--yellow",
    Weak: "badge--red",
    Negative: "badge--red",
  };
  const cls = colorMap[status] || "badge--neutral";

  return (
    <div className="fin-item">
      <div className="fin-top">
        <span className="fin-label">{label}</span>
        <span className={`fin-badge ${cls}`}>{status || "N/A"}</span>
      </div>
      {detail && <p className="fin-detail">{detail}</p>}
    </div>
  );
}

export default function ResultsPanel({ result }) {
  const { decision } = result;
  if (!decision) return null;

  const isInvest = decision.decision === "INVEST";
  const isWatch = decision.decision === "WATCH";
  const cardClass = isInvest ? "card--invest" : isWatch ? "card--watch" : "card--pass";
  const iconEmoji = isInvest ? "✅" : isWatch ? "👀" : "🚫";
  const strokeColor = isInvest ? "var(--invest)" : isWatch ? "var(--watch)" : "var(--pass)";
  const profile = decision.profile || {};
  const financial = decision.financial || {};
  const market = decision.marketPosition || {};
  const growth = decision.growth || {};
  const risks = decision.risks || [];
  const news = decision.news || [];
  const reasoning = decision.reasoning || [];
  const confidence = decision.confidence || 0;
  const keyProducts = profile.keyProducts || [];
  const revenueBreakdown = profile.revenueBreakdown || [];
  const catalysts = growth.catalysts || [];

  return (
    <section className="results">
      {/* ── Company Profile Card ── */}
      <div className="card card--profile">
        <div className="card-icon">🏢</div>
        <div className="card-content">
          <h2 className="company-name">{decision.company || result.companyName}</h2>
          <div className="profile-tags">
            <span className="tag">{profile.industry || "N/A"}</span>
            <span className="tag">{profile.sector || "N/A"}</span>
          </div>
          <p className="profile-summary">{profile.summary || "No summary available."}</p>

          {/* Company details row */}
          <div className="profile-meta">
            {profile.ceo && (
              <div className="meta-chip">
                <span className="meta-chip-label">CEO</span>
                <span className="meta-chip-value">{profile.ceo}</span>
              </div>
            )}
            {profile.founded && (
              <div className="meta-chip">
                <span className="meta-chip-label">Founded</span>
                <span className="meta-chip-value">{profile.founded}</span>
              </div>
            )}
            {profile.headquarters && (
              <div className="meta-chip">
                <span className="meta-chip-label">HQ</span>
                <span className="meta-chip-value">{profile.headquarters}</span>
              </div>
            )}
          </div>

          {/* Key Products */}
          {keyProducts.length > 0 && (
            <div className="key-products">
              <span className="kp-label">Key Products</span>
              <div className="kp-list">
                {keyProducts.map((p, i) => (
                  <span key={i} className="kp-chip">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Revenue Breakdown */}
          {revenueBreakdown.length > 0 && (
            <div className="revenue-breakdown">
              <span className="rb-label">Revenue Breakdown</span>
              <div className="rb-list">
                {revenueBreakdown.map((seg, i) => (
                  <div key={i} className="rb-item">
                    <span className="rb-segment">{seg.segment}</span>
                    <span className="rb-detail">{seg.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Decision Card ── */}
      <div className={`card card--decision ${cardClass}`}>
        <div className="decision-layout">
          <div className="decision-left">
            <span className="decision-icon">{iconEmoji}</span>
            <div>
              <p className="decision-label">Recommendation</p>
              <h2 className="decision-value">{decision.decision}</h2>
            </div>
          </div>
          <div className="decision-right">
            <div className="confidence-ring">
              <svg viewBox="0 0 100 100" className="confidence-svg">
                <circle cx="50" cy="50" r="42" className="confidence-bg" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="confidence-fill"
                  style={{
                    strokeDasharray: `${confidence * 2.64} 264`,
                    stroke: strokeColor,
                  }}
                />
              </svg>
              <span className="confidence-text">{confidence}%</span>
            </div>
            <p className="confidence-label">Confidence</p>
          </div>
        </div>
      </div>

      {/* ── Financial Health Card (Full Width) ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-emoji">💰</span>
          <h3>Financial Health</h3>
          {/* Market Cap & PE as badges */}
          <div className="fin-highlights">
            {financial.marketCap && (
              <span className="fin-highlight-chip">
                <span>Mkt Cap</span> {financial.marketCap}
              </span>
            )}
            {financial.peRatio && (
              <span className="fin-highlight-chip">
                <span>P/E</span> {financial.peRatio}
              </span>
            )}
          </div>
        </div>
        <div className="fin-grid">
          <FinancialItem label="Revenue" data={financial.revenue} />
          <FinancialItem label="Profitability" data={financial.profitability} />
          <FinancialItem label="Debt" data={financial.debt} />
          <FinancialItem label="Cash Flow" data={financial.cashFlow} />
        </div>
      </div>

      {/* ── Two-Column Grid ── */}
      <div className="grid-2">
        {/* ── Market Position Card ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-emoji">📈</span>
            <h3>Market Position</h3>
          </div>
          <div className="market-status">
            <span className="market-badge">{market.status || "N/A"}</span>
            {market.marketShare && (
              <span className="market-share-badge">{market.marketShare}</span>
            )}
          </div>
          <div className="market-detail">
            <p><strong>Competitors:</strong> {market.competition || "N/A"}</p>
            <p><strong>Advantage:</strong> {market.advantage || "N/A"}</p>
          </div>
        </div>

        {/* ── Growth Potential Card ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-emoji">🚀</span>
            <h3>Growth Potential</h3>
          </div>
          <div className="growth-content">
            <span className={`growth-rating growth--${(growth.rating || "").toLowerCase()}`}>
              {growth.rating || "N/A"}
            </span>
            <p className="growth-reason">{growth.reason || "No reason provided."}</p>
            {catalysts.length > 0 && (
              <div className="catalysts">
                <span className="catalysts-label">Key Catalysts</span>
                <ul className="catalysts-list">
                  {catalysts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── Recent News Card ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-emoji">📰</span>
            <h3>Recent News</h3>
          </div>
          <ul className="news-list">
            {news.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* ── Risks Card ── */}
        <div className="card card--risks">
          <div className="card-header">
            <span className="card-emoji">⚠️</span>
            <h3>Risks</h3>
          </div>
          <div className="risk-pills">
            {risks.map((risk, i) => (
              <div key={i} className="risk-pill">{risk}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Reasoning Card (Full Width) ── */}
      <div className="card card--reasoning">
        <div className="card-header">
          <span className="card-emoji">💡</span>
          <h3>Reasoning</h3>
        </div>
        <ol className="reasoning-list">
          {reasoning.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
