import { useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

const FAIL_WINDOW_MS = 5 * 60 * 1000; // only nag about failures from the last 5 min

export function JobsBar() {
  const jobs = useStore((s) => s.jobs);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const notice = useStore((s) => s.notice);
  const setNotice = useStore((s) => s.setNotice);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const recentFailed = jobs.filter(
    (j) =>
      j.status === "failed" &&
      !dismissed.has(j.id) &&
      Date.now() - new Date(j.updatedAt).getTime() < FAIL_WINDOW_MS,
  ).slice(0, 1);

  return (
    <div className="jobs-bar">
      {notice && (
        <span className="job ok" onClick={() => setNotice(null)} title="dismiss">
          ✓ {notice.slice(0, 160)} ✕
        </span>
      )}
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
        <span key={j.id} className="job err" title="dismiss"
              onClick={() => setDismissed((d) => new Set(d).add(j.id))}>
          ⚠ {j.type}: {j.error?.slice(0, 120)} ✕
        </span>
      ))}
      {!active.length && !error && !recentFailed.length && (
        <span className="job dim">IDLE</span>
      )}
    </div>
  );
}
