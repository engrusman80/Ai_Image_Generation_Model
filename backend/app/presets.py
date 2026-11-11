"""Supported FLUX models, their recommended settings, and the image sizes per aspect ratio.

Values are taken from the official Hugging Face model cards (checked 2026-11-11).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPreset:
    model_id: str
    pipeline: str  # "flux2-klein" -> Flux2KleinPipeline, "flux1" -> FluxPipeline
    steps: int
    guidance: float
    max_sequence_length: int | None  # FLUX.1 only
    license: str
    commercial_use: bool
    gated: bool  # needs a Hugging Face login + accepting the license on the model page


MODEL_PRESETS: dict[str, ModelPreset] = {
    p.model_id: p
    for p in [
        # Step-distilled: 4 steps, guidance is ignored by the pipeline.
        ModelPreset("black-forest-labs/FLUX.2-klein-4B", "flux2-klein", 4, 1.0, None, "Apache-2.0", True, False),
        ModelPreset("black-forest-labs/FLUX.2-klein-9B", "flux2-klein", 4, 1.0, None, "FLUX Non-Commercial", False, True),
        ModelPreset("black-forest-labs/FLUX.1-schnell", "flux1", 4, 0.0, 256, "Apache-2.0", True, True),
        # The model card example uses 50 steps; 28 is the common quality/speed balance.
        ModelPreset("black-forest-labs/FLUX.1-dev", "flux1", 28, 3.5, 512, "FLUX.1 [dev] Non-Commercial", False, True),
    ]
}

# About one megapixel each. FLUX needs width and height divisible by 16.
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "4:3": (1152, 864),
    "16:9": (1360, 768),
    "9:16": (768, 1360),
}


def get_preset(model_id: str) -> ModelPreset:
    try:
        return MODEL_PRESETS[model_id]
    except KeyError:
        raise ValueError(f"Unsupported MODEL_ID {model_id!r}. Choose one of: {', '.join(MODEL_PRESETS)}") from None
