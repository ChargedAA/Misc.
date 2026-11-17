"""Fetch the pretrained weights the image-based imitator needs (~3 GB, into the HF cache).

Only data files are downloaded (weights, configs, tokenizer metadata); the model
code lives in hwsynth/eruku.py, so nothing fetched here is executed.
"""

from huggingface_hub import hf_hub_download

FILES = {
    "blowing-up-groundhogs/eruku": ["config.json", "pytorch_model.bin"],
    "blowing-up-groundhogs/emuru_vae": ["config.json", "diffusion_pytorch_model.safetensors"],
    "google/byt5-small": ["tokenizer_config.json", "special_tokens_map.json"],
    "google-t5/t5-large": ["config.json"],
}


def fetch():
    return {repo: [hf_hub_download(repo, name) for name in names] for repo, names in FILES.items()}


if __name__ == "__main__":
    for repo, paths in fetch().items():
        for path in paths:
            print(repo, "->", path)
