# Image worker

Runs FLUX with Hugging Face diffusers. It is filled in later:

- **Phase 2:** `local` mode: a small server on your laptop running a quantized FLUX on the 8 GB GPU.
- **Phase 3:** `runpod` mode: `handler.py`, `Dockerfile` and `requirements.txt` for RunPod Serverless.

In Phase 1 the backend draws placeholder images itself (`WORKER_MODE=mock`), so this folder holds
no code yet.

## Job format (same for every mode)

The backend sends:

```json
{
  "input": {
    "prompt": "A red fox in fresh snow, golden hour",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "guidance": 1.0,
    "seed": 12345,
    "model_id": "black-forest-labs/FLUX.2-klein-4B",
    "max_sequence_length": null
  }
}
```

The worker replies with a JPEG image as base64: `{"image_base64": "...", "content_type": "image/jpeg"}`.
