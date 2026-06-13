/**
 * gpu-compute.ts — a first-party WebGPU compute kernel (WGSL).
 *
 * web-frontier-prd §Phase 2 marquee capability: general-purpose GPU compute in
 * the browser, distinct from the web-llm inference path. Runs a square matmul on
 * the GPU and reports throughput — a self-contained benchmark that touches
 * neither the game's WebGL render path nor any dependency. Kernel shape adapted
 * from ../../tinygpt/webgpu/matmul.wgsl (naive one-thread-per-output variant).
 */

const MATMUL_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> b : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;
@group(0) @binding(3) var<uniform> n : u32;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let row = gid.y;
  let col = gid.x;
  if (row >= n || col >= n) { return; }
  var sum = 0.0;
  for (var k : u32 = 0u; k < n; k = k + 1u) {
    sum = sum + a[row * n + k] * b[k * n + col];
  }
  c[row * n + col] = sum;
}
`;

export interface ComputeResult {
  n: number;
  ms: number;
  gflops: number;
  /** c[0] — a cheap correctness signal (a,b filled with 1.0 ⇒ c[0] === n). */
  checkValue: number;
  checkExpected: number;
}

/** Run an n×n f32 matmul on the GPU and report wall-clock throughput. */
export async function runMatmulBenchmark(n = 384): Promise<ComputeResult> {
  const gpu = (navigator as { gpu?: GPU }).gpu;
  if (!gpu) throw new Error("WebGPU unavailable.");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter.");
  const device = await adapter.requestDevice();

  // The WebGPU flag enums are runtime globals not declared as values in this
  // TS lib; read them off globalThis (present whenever navigator.gpu is).
  const BUF = (globalThis as unknown as { GPUBufferUsage: { STORAGE: number; COPY_DST: number; COPY_SRC: number; UNIFORM: number; MAP_READ: number } }).GPUBufferUsage;
  const MAP = (globalThis as unknown as { GPUMapMode: { READ: number } }).GPUMapMode;

  const elements = n * n;
  const bytes = elements * 4;
  const a = new Float32Array(elements).fill(1);
  const b = new Float32Array(elements).fill(1);

  const aBuf = device.createBuffer({ size: bytes, usage: BUF.STORAGE | BUF.COPY_DST });
  const bBuf = device.createBuffer({ size: bytes, usage: BUF.STORAGE | BUF.COPY_DST });
  const cBuf = device.createBuffer({ size: bytes, usage: BUF.STORAGE | BUF.COPY_SRC });
  const nBuf = device.createBuffer({ size: 4, usage: BUF.UNIFORM | BUF.COPY_DST });
  const readBuf = device.createBuffer({ size: bytes, usage: BUF.MAP_READ | BUF.COPY_DST });

  device.queue.writeBuffer(aBuf, 0, a);
  device.queue.writeBuffer(bBuf, 0, b);
  device.queue.writeBuffer(nBuf, 0, new Uint32Array([n]));

  const module = device.createShaderModule({ code: MATMUL_WGSL });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: aBuf } },
      { binding: 1, resource: { buffer: bBuf } },
      { binding: 2, resource: { buffer: cBuf } },
      { binding: 3, resource: { buffer: nBuf } },
    ],
  });

  const groups = Math.ceil(n / 16);
  const start = performance.now();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(groups, groups);
  pass.end();
  encoder.copyBufferToBuffer(cBuf, 0, readBuf, 0, bytes);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const ms = performance.now() - start;

  await readBuf.mapAsync(MAP.READ);
  const checkValue = new Float32Array(readBuf.getMappedRange().slice(0, 4))[0] ?? 0;
  readBuf.unmap();
  device.destroy();

  const gflops = (2 * n * n * n) / (ms / 1000) / 1e9;
  return { n, ms, gflops, checkValue, checkExpected: n };
}
