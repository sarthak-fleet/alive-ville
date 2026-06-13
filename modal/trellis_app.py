"""
Modal app — TRELLIS image-to-3D (microsoft/TRELLIS).

Spike for `docs/experiments/image-to-3d-bakeoff.md`.  Takes a portrait PNG,
returns a textured GLB.  Single endpoint, single GPU class, no fan-out.

Build strategy
--------------
TRELLIS depends on several custom CUDA-compiled extensions
(`diffoctreerast`, `nvdiffrast`, `spconv`, `xformers`, etc.) and is shipped
as a *repo*, not a pip package — `from trellis.pipelines import ...`
imports out of the cloned tree.  So we:

  1. Base image = `nvidia/cuda:12.1.0-devel-ubuntu22.04` so `nvcc` is on PATH
     for any from-source builds.
  2. Install torch 2.4.0 + cu121.
  3. Install pre-built wheels for `xformers` and `spconv-cu120`.
  4. Build `diffoctreerast` and `nvdiffrast` from source.
  5. Clone the TRELLIS repo into `/opt/trellis` and add it to PYTHONPATH.
  6. Use `ATTN_BACKEND=xformers` and `SPCONV_ALGO=native` — flash-attn skipped
     to keep the build under the 15-min cap.

Weights live on a persistent Volume mounted at `/root/.cache/huggingface`;
the first cold start downloads ~5 GB and every subsequent one is fast.

GPU: A10G (24GB).  TRELLIS-image-large is 1.2B params, comfortably fits.

Deploy: `modal deploy modal/trellis_app.py`
"""

import modal

APP_NAME = "trellis-image-to-3d"
HF_REPO = "microsoft/TRELLIS-image-large"
HF_CACHE = "/root/.cache/huggingface"
TRELLIS_DIR = "/opt/trellis"

# Persistent volume — weights download once and persist across deploys.
models_volume = modal.Volume.from_name("trellis-models", create_if_missing=True)

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
        # Basic deps from setup.sh --basic
        "pillow",
        "imageio",
        "imageio-ffmpeg",
        "tqdm",
        "easydict",
        "opencv-python-headless",
        "scipy",
        "ninja",
        "rembg",
        "onnxruntime",
        "trimesh",
        "open3d",
        "xatlas",
        "pyvista",
        "pymeshfix",
        "igraph",
        "transformers",
        "huggingface_hub>=0.28.0",
        "safetensors",
        "accelerate",
        "fastapi[standard]==0.115.6",
        "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8",
    )
    .pip_install(
        # Pre-built wheels — avoids from-source builds where possible.
        "xformers==0.0.27.post2",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "spconv-cu120",
    )
    .pip_install(
        # Kaolin is required for the FlexiCubes mesh extractor used at
        # inference time.  Prebuilt wheel for torch 2.4.0 + cu121.
        "kaolin",
        find_links="https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.4.0_cu121.html",
    )
    .pip_install(
        # `wheel` + a recent `setuptools` are needed in the outer env for the
        # --no-build-isolation builds below to produce a wheel ("bdist_wheel").
        "wheel",
        "setuptools>=70",
    )
    .run_commands(
        # Clone TRELLIS itself.  We import out of the tree (it isn't a pip
        # package).  Pinned to a known-good commit so deploys are repeatable.
        f"git clone https://github.com/microsoft/TRELLIS.git {TRELLIS_DIR}",
        f"cd {TRELLIS_DIR} && git submodule update --init --recursive",
    )
    .run_commands(
        # Build the two custom CUDA extensions from source.  These take a few
        # minutes each but the result is baked into the image so cold starts
        # don't pay it again.
        #
        # Flags:
        #   --no-build-isolation: their setup.py files import
        #     torch.utils.cpp_extension at module level and they don't declare
        #     torch in build-system.requires, so pip's isolated build env
        #     can't see the torch we just installed.
        #   TORCH_DONT_CHECK_COMPILER_ABI=1: setuptools >= 70 on this image
        #     sets distutils.compiler_cxx to clang++ by default; torch then
        #     errors on `which clang++` since the image is gcc-only.  Skipping
        #     the ABI check is safe — we know we built torch against a
        #     compatible CUDA/gcc toolchain in the same image.
        "mkdir -p /tmp/extensions",
        "git clone https://github.com/NVlabs/nvdiffrast.git /tmp/extensions/nvdiffrast",
        "TORCH_DONT_CHECK_COMPILER_ABI=1 CC=gcc CXX=g++ pip install --no-build-isolation /tmp/extensions/nvdiffrast",
        "git clone --recurse-submodules https://github.com/JeffreyXiang/diffoctreerast.git /tmp/extensions/diffoctreerast",
        "TORCH_DONT_CHECK_COMPILER_ABI=1 CC=gcc CXX=g++ pip install --no-build-isolation /tmp/extensions/diffoctreerast",
        # mip-splatting's diff-gaussian-rasterization is required to bake
        # texture from the Gaussian representation during GLB export.
        "git clone https://github.com/autonomousvision/mip-splatting.git /tmp/extensions/mip-splatting",
        "TORCH_DONT_CHECK_COMPILER_ABI=1 CC=gcc CXX=g++ pip install --no-build-isolation /tmp/extensions/mip-splatting/submodules/diff-gaussian-rasterization/",
        gpu="A10G",  # CUDA ext compilation wants a GPU visible for arch detection.
    )
    .env({
        "HF_HUB_CACHE": HF_CACHE,
        "PYTHONPATH": TRELLIS_DIR,
        "ATTN_BACKEND": "xformers",
        "SPCONV_ALGO": "native",
    })
)

app = modal.App(APP_NAME, image=image)


@app.cls(
    gpu="A10G",
    scaledown_window=120,
    max_containers=2,
    timeout=1800,
    volumes={HF_CACHE: models_volume},
)
@modal.concurrent(max_inputs=1)
class Trellis:
    """Holds the loaded TRELLIS pipeline across many generations."""

    @modal.enter()
    def load(self) -> None:
        import sys
        if TRELLIS_DIR not in sys.path:
            sys.path.insert(0, TRELLIS_DIR)
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=HF_REPO, cache_dir=HF_CACHE)

        from trellis.pipelines import TrellisImageTo3DPipeline
        self.pipeline = TrellisImageTo3DPipeline.from_pretrained(HF_REPO)
        self.pipeline.cuda()

    @modal.fastapi_endpoint(method="POST", docs=False)
    def generate(self, payload: dict):
        import base64
        import io
        import sys
        import tempfile
        from fastapi import HTTPException
        from fastapi.responses import Response
        from PIL import Image

        if TRELLIS_DIR not in sys.path:
            sys.path.insert(0, TRELLIS_DIR)
        from trellis.utils import postprocessing_utils

        b64 = payload.get("image_b64")
        if not b64:
            raise HTTPException(status_code=400, detail="image_b64 is required")
        seed = int(payload.get("seed") or 0)
        simplify = float(payload.get("simplify") or 0.95)
        texture_size = int(payload.get("texture_size") or 1024)

        try:
            raw = base64.b64decode(b64)
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"bad image: {e}")

        outputs = self.pipeline.run(image, seed=seed)
        glb = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=simplify,
            texture_size=texture_size,
        )

        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            glb.export(f.name)
            path = f.name
        with open(path, "rb") as f:
            data = f.read()
        return Response(content=data, media_type="model/gltf-binary")
