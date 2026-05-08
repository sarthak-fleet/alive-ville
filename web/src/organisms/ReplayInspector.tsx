import { Badge } from "../atoms/Badge.tsx";
import { Panel } from "../atoms/Panel.tsx";
import { useWorldStore } from "../store/world.ts";
import { inspectReplay } from "../../../src/replay.ts";

export function ReplayInspector() {
  const world = useWorldStore((state) => state.world);

  if (!world) {
    return null;
  }

  const report = inspectReplay(world);

  return (
    <Panel title="Replay inspector">
      <div className="inspector-summary">
        <Badge>{report.frames.length} frames</Badge>
        <Badge>{report.warnings.length} warnings</Badge>
      </div>
      {report.warnings.length > 0 && (
        <ul className="warning-list">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <ol className="replay-list">
        {report.frames.slice(-8).map((frame) => (
          <li key={`${frame.tick}-${frame.checksum}`}>
            <div className="replay-row">
              <strong>Tick {frame.tick}</strong>
              <code>{frame.checksum}</code>
            </div>
            <p>
              {frame.clock} · {frame.applied} applied · {frame.rejected} rejected
              {frame.directorActions > 0 ? ` · ${frame.directorActions} director` : ""}
            </p>
            <p className="muted">
              Actors: {frame.changedActors.length ? frame.changedActors.join(", ") : "none"}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
