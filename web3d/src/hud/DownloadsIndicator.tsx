import { useLocalBrain } from "../ai/local-llm.ts";
import { useKokoroDownload } from "../platform/kokoro.ts";
import { useUiStore } from "../store/ui.ts";

type RowStatus = "idle" | "loading" | "ready" | "error" | "unavailable";

interface ModelRow {
  key: string;
  label: string;
  sub: string;
  status: RowStatus;
  progress: number;
}

function statusNote(status: RowStatus): string {
  switch (status) {
    case "loading": return "Downloading…";
    case "ready": return "Ready ✓";
    case "error": return "Failed — using fallback";
    case "unavailable": return "Needs WebGPU";
    default: return "Downloads on first use";
  }
}

/**
 * Surfaces the in-browser AI models that get fetched to the user's device —
 * Kokoro (voice) and the local LLM brain — with live download progress. On the
 * start screen it lists every model and its state; in-game it only appears while
 * something is actually downloading, so it never clutters play.
 */
export function DownloadsIndicator(): React.ReactElement | null {
  const phase = useUiStore((state) => state.gamePhase);
  const kokoro = useKokoroDownload();
  const brain = useLocalBrain();

  const brainStatus: RowStatus =
    brain.status === "unsupported"
      ? "unavailable"
      : brain.status === "loading"
        ? "loading"
        : brain.status === "ready" || brain.status === "generating"
          ? "ready"
          : brain.status === "error"
            ? "error"
            : "idle";

  const rows: ModelRow[] = [
    { key: "kokoro", label: "Kokoro voice", sub: "Natural NPC speech (TTS)", status: kokoro.status, progress: kokoro.progress },
    { key: "brain", label: "Local AI brain", sub: "In-browser dialogue (LLM)", status: brainStatus, progress: brain.progress },
  ];

  const onStart = phase !== "playing";
  const visibleRows = onStart ? rows : rows.filter((row) => row.status === "loading");
  if (visibleRows.length === 0) return null;

  return (
    <div className={`downloads-indicator ${onStart ? "on-start" : ""}`}>
      <div className="downloads-title">In-browser models</div>
      {visibleRows.map((row) => (
        <div key={row.key} className={`download-row ${row.status}`}>
          <div className="download-row-head">
            <span className="download-label">{row.label}</span>
            <span className="download-note">
              {row.status === "loading" ? `${Math.round(row.progress * 100)}%` : statusNote(row.status)}
            </span>
          </div>
          {row.status === "loading" ? (
            <div className="download-track">
              <div className="download-fill" style={{ width: `${Math.round(row.progress * 100)}%` }} />
            </div>
          ) : (
            <div className="download-sub">{row.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
