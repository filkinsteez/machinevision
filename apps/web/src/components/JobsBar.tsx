import { api } from "../api";
import { useStore } from "../store";

export function JobsBar() {
  const jobs = useStore((s) => s.jobs);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const recentFailed = jobs.filter((j) => j.status === "failed").slice(0, 1);

  return (
    <div className="jobs-bar">
      {error && (
        <span className="job err" onClick={() => setError(null)} title="dismiss">
          ⚠ {error.slice(0, 160)} ✕
        </span>
      )}
      {active.map((j) => (
        <span key={j.id} className="job">
          <span className="spinner" />
          {j.type} {(j.progress * 100).toFixed(0)}%
          <em>{j.stage}</em>
          <button onClick={() => api.cancelJob(j.id)}>✕</button>
        </span>
      ))}
      {!active.length && !error && recentFailed.map((j) => (
        <span key={j.id} className="job err">⚠ {j.type}: {j.error?.slice(0, 120)}</span>
      ))}
      {!active.length && !error && !recentFailed.length && (
        <span className="job dim">IDLE</span>
      )}
    </div>
  );
}
