/**
 * gpu-render.ts — an isolated WebGPU *render* pipeline (WGSL vertex + fragment).
 *
 * Proves the Phase-2 WebGPU render capability without swapping the game's WebGL
 * renderer: draws an animated plasma to a caller-supplied canvas via its own
 * WebGPU device + swapchain. Zero coupling to the R3F/Three render path.
 */

const RENDER_WGSL = /* wgsl */ `
struct VsOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) i : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VsOut;
  let xy = p[i];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = xy * 0.5 + vec2<f32>(0.5, 0.5);
  return o;
}

@group(0) @binding(0) var<uniform> t : f32;

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let uv = in.uv * 6.0;
  let v = sin(uv.x + t) + sin(uv.y + t * 1.3) + sin((uv.x + uv.y) * 0.7 + t * 0.7);
  let r = 0.5 + 0.5 * sin(v);
  let g = 0.5 + 0.5 * sin(v + 2.094);
  let b = 0.5 + 0.5 * sin(v + 4.188);
  return vec4<f32>(r, g, b, 1.0);
}
`;

/** Start the demo on `canvas`; returns a stop() that halts the loop and frees the device. */
export async function startRenderDemo(canvas: HTMLCanvasElement): Promise<() => void> {
  const gpu = (navigator as { gpu?: GPU }).gpu;
  if (!gpu) throw new Error("WebGPU unavailable.");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter.");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) throw new Error("No WebGPU canvas context.");

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  const BUF = (globalThis as unknown as { GPUBufferUsage: { UNIFORM: number; COPY_DST: number } }).GPUBufferUsage;
  const uniform = device.createBuffer({ size: 4, usage: BUF.UNIFORM | BUF.COPY_DST });

  const shader = device.createShaderModule({ code: RENDER_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shader, entryPoint: "vs" },
    fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });

  let raf = 0;
  let running = true;
  const started = performance.now();
  const frame = (): void => {
    if (!running) return;
    device.queue.writeBuffer(uniform, 0, new Float32Array([(performance.now() - started) / 1000]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    device.destroy();
  };
}
