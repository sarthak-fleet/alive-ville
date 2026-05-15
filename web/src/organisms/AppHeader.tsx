import { timeOfDay } from "../../../src/types.ts";
import { Badge } from "../atoms/Badge.tsx";
import { Button } from "../atoms/Button.tsx";
import { useWorldStore } from "../store/world.ts";

export function AppHeader() {
  const world = useWorldStore((s) => s.world);
  const send = useWorldStore((s) => s.send);
  if (!world) return <header><h1>Ashbend Village</h1></header>;
  const tod = timeOfDay(world.clock);
  return (
    <header>
      <h1>Ashbend Village</h1>
      <Badge>Day {world.clock.day} · {world.clock.hour.toString().padStart(2, "0")}:00 · {tod}</Badge>
      <span className="grow" />
      <Button variant="primary" onClick={() => void send(null)}>Wait</Button>
    </header>
  );
}
