import { useState } from "react";
import "./ResearchForm.css";

export default function ResearchForm({ onSubmit, loading, examples }) {
  const [company, setCompany] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (company.trim() && !loading) {
      onSubmit(company.trim());
    }
  }

  return (
    <section className="form-card">
      <form onSubmit={handleSubmit} className="research-form">
        <label htmlFor="company">Company name</label>
        <div className="input-row">
          <input
            id="company"
            type="text"
            placeholder="e.g. Apple, Tesla, Infosys..."
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !company.trim()}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden />
                Researching...
              </>
            ) : (
              "Analyze"
            )}
          </button>
        </div>
      </form>

      <div className="examples">
        <span className="examples-label">Try:</span>
        {examples.map((name) => (
          <button
            key={name}
            type="button"
            className="example-chip"
            disabled={loading}
            onClick={() => {
              setCompany(name);
              onSubmit(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}
