"""
Modal app — Hunyuan3D-2 image-to-3D (Tencent).

Two-stage pipeline:
  1. `Hunyuan3DDiTFlowMatchingPipeline` (shape generator)
  2. `Hunyuan3DPaintPipeline` (texture painter)

Companion to `modal/trellis_app.py` for the bake-off in
`docs/experiments/image-to-3d-bakeoff.md`.

License note: Hunyuan3D-2 ships under the Tencent Hunyuan 3D 2.0 Community
License (not MIT).  It permits commercial use under terms but excludes EU,
UK, and South Korea, and imposes an Acceptable Use Policy.  Read the LICENSE
before shipping anything serious.

Build strategy
--------------
Same shape as `trellis_app.py`:

  - `nvidia/cuda:12.1.0-devel-ubuntu22.04` so `nvcc` is on PATH.
  - Clone the Hunyuan3D-2 repo into `/opt/hunyuan3d`.
  - `pip install` the two custom extensions
    (`custom_rasterizer`, `differentiable_renderer`) from their setup.pys.
  - Add the repo root to PYTHONPATH so `from hy3dgen... import` works.

Weights (~10 GB shape + paint) live on a Modal Volume.

GPU: L40S.  Shape DiT alone is ~3B params; paint pipeline adds another
big stack.  A10G's 24GB is tight — L40S gives us headroom for the
shape+paint sequential execution.

Deploy: `modal deploy modal/hunyuan3d_app.py`
"""

import modal

APP_NAME = "hunyuan3d-image-to-3d"
HF_REPO = "tencent/Hunyuan3D-2"
HF_CACHE = "/root/.cache/huggingface"
HY3D_DIR = "/opt/hunyuan3d"

models_volume = modal.Volume.from_name("hunyuan3d-models", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.0-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install(
        "git",
        "build-essential",
        "ninja-build",
        "libgl1",
        "libglib2.0-0",
        "libgomp1",
    )
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "ninja",
        "pybind11",
        # Pin diffusers/transformers: latest (5.x/diffusers >=1.0) ships
        # autoencoder_kl using new torch.library.infer_schema signatures
        # that torch 2.4 rejects.  Use Hunyuan3D-2's tested-against range.
        "diffusers==0.30.3",
        "transformers==4.46.0",
        "accelerate",
        "einops",
        "opencv-python-headless",
        "numpy<2",
        "omegaconf",
        "tqdm",
        "trimesh",
        "pymeshlab",
        "pygltflib",
        "xatlas",
        "rembg",
        "onnxruntime",
        "huggingface_hub>=0.28.0",
        "safetensors",
        "Pillow",
        "fastapi[standard]==0.115.6",
        # `wheel` + recent `setuptools` are needed in the outer env so the
        # --no-build-isolation extension builds below can produce a wheel.
        "wheel",
        "setuptools>=70",
    )
    .run_commands(
        f"git clone https://github.com/Tencent/Hunyuan3D-2.git {HY3D_DIR}",
        # Build the two custom extensions.  Flags:
        #   --no-build-isolation: setup.py files import
        #     torch.utils.cpp_extension at module level and don't declare
        #     torch in build-system.requires.
        #   TORCH_DONT_CHECK_COMPILER_ABI=1: setuptools >= 70 on this image
        #     advertises distutils.compiler_cxx as clang++ (no clang installed);
        #     torch errors on `which clang++`.  Skipping the ABI check is safe
        #     because we know we built torch against a compatible gcc/CUDA
        #     toolchain in this same image.
        #   CC/CXX: belt-and-braces — ensure ninja invokes gcc.
        f"cd {HY3D_DIR}/hy3dgen/texgen/custom_rasterizer && TORCH_DONT_CHECK_COMPILER_ABI=1 CC=gcc CXX=g++ pip install --no-build-isolation .",
        f"cd {HY3D_DIR}/hy3dgen/texgen/differentiable_renderer && TORCH_DONT_CHECK_COMPILER_ABI=1 CC=gcc CXX=g++ pip install --no-build-isolation .",
        gpu="L40S",
    )
    .env({
        "HF_HUB_CACHE": HF_CACHE,
        "PYTHONPATH": HY3D_DIR,
    })
)

app = modal.App(APP_NAME, image=image)


@app.cls(
    gpu="L40S",
    scaledown_window=180,
    max_containers=1,
    timeout=1800,
    volumes={HF_CACHE: models_volume},
)
@modal.concurrent(max_inputs=1)
class Hunyuan3D:
    """Loads both shape and paint pipelines once, reuses across calls."""

    @modal.enter()
    def load(self) -> None:
        import sys
        if HY3D_DIR not in sys.path:
            sys.path.insert(0, HY3D_DIR)
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=HF_REPO, cache_dir=HF_CACHE)

        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        from hy3dgen.texgen import Hunyuan3DPaintPipeline
        from hy3dgen.rembg import BackgroundRemover

        self.rembg = BackgroundRemover()
        self.shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(HF_REPO)
        self.paint = Hunyuan3DPaintPipeline.from_pretrained(HF_REPO)

    @modal.fastapi_endpoint(method="POST", docs=False)
    def generate(self, payload: dict):
        import base64
        import io
        import tempfile
        from fastapi import HTTPException
        from fastapi.responses import Response
        from PIL import Image

        b64 = payload.get("image_b64")
        if not b64:
            raise HTTPException(status_code=400, detail="image_b64 is required")
        skip_texture = bool(payload.get("skip_texture") or False)

        try:
            raw = base64.b64decode(b64)
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"bad image: {e}")

        if image.mode == "RGB":
            image = self.rembg(image)

        mesh = self.shape(image=image)[0]
        if not skip_texture:
            mesh = self.paint(mesh, image=image)

        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            mesh.export(f.name)
            path = f.name
        with open(path, "rb") as f:
            data = f.read()
        return Response(content=data, media_type="model/gltf-binary")
