import "./AnalysisProgress.css";

const FIELDS = [
  {
    id: "wikipedia",
    label: "Company Profile",
    description: "Wikipedia & business overview",
    icon: "🏢",
  },
  {
    id: "stock_data",
    label: "Stock & Financial Data",
    description: "Yahoo Finance market data",
    icon: "📊",
  },
  {
    id: "web_search",
    label: "Web Research",
    description: "News, reports & competitive intel",
    icon: "🌐",
  },
  {
    id: "analysis",
    label: "AI Analysis",
    description: "Investment decision & reasoning",
    icon: "🤖",
  },
];

function StatusIcon({ status }) {
  if (status === "done") {
    return <span className="status-icon status-done">✓</span>;
  }
  if (status === "failed") {
    return <span className="status-icon status-failed">!</span>;
  }
  if (status === "loading") {
    return (
      <span className="status-icon status-loading">
        <span className="pulse-ring" />
      </span>
    );
  }
  // waiting
  return <span className="status-icon status-waiting" />;
}

export default function AnalysisProgress({ companyName, fieldStatuses, fieldMessages }) {
  const completedCount = Object.values(fieldStatuses).filter(
    (s) => s === "done" || s === "failed"
  ).length;
  const totalFields = FIELDS.length;
  const progressPct = Math.round((completedCount / totalFields) * 100);

  return (
    <section className="analysis-progress">
      <div className="ap-header">
        <div className="ap-badge">Analyzing</div>
        <h1 className="ap-company">{companyName}</h1>
        <p className="ap-subtitle">
          Our AI agent is researching this company across multiple data sources.
          Each field will update in real-time as data is fetched.
        </p>
      </div>

      {/* Progress bar */}
      <div className="ap-progress-bar">
        <div className="ap-progress-track">
          <div
            className="ap-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="ap-progress-text">
          {completedCount}/{totalFields} fields complete
        </span>
      </div>

      {/* Field cards */}
      <div className="ap-fields">
        {FIELDS.map((field, index) => {
          const status = fieldStatuses[field.id] || "waiting";
          return (
            <div
              key={field.id}
              className={`ap-field ap-field--${status}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="ap-field-left">
                <span className="ap-field-icon">{field.icon}</span>
                <div className="ap-field-info">
                  <span className="ap-field-label">{field.label}</span>
                  <span className="ap-field-desc">{field.description}</span>
                </div>
              </div>
              <div className="ap-field-right">
                <StatusIcon status={status} />
                <span className={`ap-field-status-text ap-status-text--${status}`}>
                  {status === "done" && (fieldMessages?.[field.id] || "Fetched")}
                  {status === "failed" && (fieldMessages?.[field.id] || "Skipped")}
                  {status === "loading" && (fieldMessages?.[field.id] || "Fetching...")}
                  {status === "waiting" && "Waiting"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom tip */}
      <div className="ap-tip">
        <span className="ap-tip-icon">💡</span>
        <span>
          If a field is skipped, the AI will use alternative data sources to
          complete the analysis.
        </span>
      </div>
    </section>
  );
}
