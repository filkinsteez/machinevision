import { useRef } from "react";
import { useStore } from "../store";

export function MediaPanel() {
  const assets = useStore((s) => s.assets);
  const selected = useStore((s) => s.selectedAssetId);
  const upload = useStore((s) => s.upload);
  const selectAsset = useStore((s) => s.selectAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="panel">
      <h3>
        MEDIA
        <button className="add" title="drop a file anywhere, or browse" onClick={() => fileRef.current?.click()}>+ ADD</button>
      </h3>
      <input
        id="mv-file-input"
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
      />
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
              title="delete"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete ${a.name}?`)) deleteAsset(a.id);
              }}
            >✕</button>
          </li>
        ))}
        {!assets.length && <li className="dim empty">drop a file anywhere</li>}
      </ul>
    </section>
  );
}
