import { useEffect, useRef, useState } from 'react';

/**
 * Always-on FPS readout pinned to the top-right corner. Colour-coded so "clunky"
 * is instantly diagnosable: green ≥50, amber ≥30, red below. Also shows frame ms.
 */
export function FpsCounter(): React.ReactElement {
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);
  const frames = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    last.current = performance.now();
    const tick = (): void => {
      frames.current += 1;
      const now = performance.now();
      const elapsed = now - last.current;
      if (elapsed >= 500) {
        const f = (frames.current * 1000) / elapsed;
        setFps(Math.round(f));
        setMs(Math.round((elapsed / frames.current) * 10) / 10);
        frames.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tier = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
  return (
    <div className={`fps-counter ${tier}`} title={`${ms} ms/frame`}>
      <span className="fps-num">{fps}</span> <span className="fps-unit">FPS</span>
    </div>
  );
}
