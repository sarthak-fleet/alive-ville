/**
 * webtransport.ts — HTTP/3 (QUIC) transport client, feature-detected.
 *
 * web-frontier-prd §Phase 3: the modern low-latency replacement for the live
 * SSE feed. Provided as a ready, detected transport — NOT wired in as the
 * default, since it needs an HTTP/3 server endpoint to function. The existing
 * SSE `connectLive` path stays authoritative until a QUIC endpoint exists.
 */

interface WebTransportLike {
  readonly ready: Promise<void>;
  readonly closed: Promise<unknown>;
  close: () => void;
}
type WebTransportCtor = new (url: string) => WebTransportLike;

function ctor(): WebTransportCtor | null {
  return (globalThis as unknown as { WebTransport?: WebTransportCtor }).WebTransport ?? null;
}

export function webTransportSupported(): boolean {
  return ctor() !== null;
}

/** Open a WebTransport session and resolve once it is ready. Caller handles errors. */
export async function connectWebTransport(url: string): Promise<WebTransportLike> {
  const Ctor = ctor();
  if (!Ctor) throw new Error('WebTransport unavailable.');
  const transport = new Ctor(url);
  await transport.ready;
  return transport;
}
