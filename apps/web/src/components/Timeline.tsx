import { useStore } from "../store";
import { previewController } from "./PreviewCanvas";

export function Timeline() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.selectedAssetId) ?? null);
  const frame = useStore((s) => s.currentFrame);
  const playing = useStore((s) => s.playing);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const audioEnabled = useStore((s) => s.audioConfig().enabled);
  const setAudioReactive = useStore((s) => s.setAudioReactive);
  if (!asset || asset.status !== "ready") return <div className="timeline" />;
  const frameCount = asset.frameCount ?? 1;
  const isVideo = asset.type === "video";

  return (
    <div className="timeline">
      <div className="transport">
        <button onClick={() => previewController.seek(Math.max(frame - 1, 0))} title="step back one frame">◀|</button>
        <button
          className="play"
          onClick={() => (playing ? previewController.pause() : previewController.play())}
          disabled={!isVideo}
        >
          {playing ? "PAUSE" : "PLAY"}
        </button>
        <button onClick={() => previewController.seek(Math.min(frame + 1, frameCount - 1))} title="step forward one frame">|▶</button>
        <button
          className={muted ? "" : "active"}
          disabled={!isVideo}
          title={muted ? "sound is off — click to unmute" : "sound is on — click to mute"}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (previewController.video) previewController.video.muted = next;
          }}
        >{muted ? "🔇 OFF" : "🔊 ON"}</button>
        <button
          className={audioEnabled ? "active" : ""}
          disabled={!isVideo}
          title="Audio-reactive: effects pulse to the video's audio (same as the AUDIO panel)"
          onClick={() => setAudioReactive({ enabled: !audioEnabled })}
        >REACT</button>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(frameCount - 1, 0)}
        value={frame}
        disabled={!isVideo}
        onChange={(e) => previewController.seek(Number(e.target.value))}
      />
      <div className="frame-readout">
        {String(frame).padStart(6, "0")} / {String(frameCount - 1).padStart(6, "0")}
        <span className="dim"> {asset.fps ? `${asset.fps.toFixed(2)}fps` : ""}</span>
      </div>
    </div>
  );
}
