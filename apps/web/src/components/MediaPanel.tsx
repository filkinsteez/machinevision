import { useCallback, useRef, useState } from "react";
import { useStore } from "../store";

export function MediaPanel() {
  const assets = useStore((s) => s.assets);
  const selected = useStore((s) => s.selectedAssetId);
  const upload = useStore((s) => s.upload);
  const selectAsset = useStore((s) => s.selectAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  return (
    <section className="panel">
      <h3>MEDIA</h3>
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        DROP IMAGE / VIDEO
        <span className="dim">mp4 mov webm png jpg · ≤60s</span>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </div>
      <ul className="asset-list">
        {assets.map((a) => (
          <li
            key={a.id}
            className={a.id === selected ? "sel" : ""}
            onClick={() => selectAsset(a.id)}
          >
            {a.thumbnailUrl && <img src={a.thumbnailUrl} alt="" />}
            <div className="grow">
              <div className="name">{a.name}</div>
              <div className="dim">
                {a.status !== "ready" ? a.status.toUpperCase()
                  : `${a.width}×${a.height}${a.type === "video" ? ` · ${a.frameCount}f` : ""}`}
              </div>
            </div>
            <button
              title="delete asset and its passes"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete ${a.name} and all of its vision passes?`)) {
                  deleteAsset(a.id);
                }
              }}
            >✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
