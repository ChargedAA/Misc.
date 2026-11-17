"""Image-based ("offline") handwriting imitation with Eruku.

    Zaccagnino et al., "Autoregressive Styled Text Image Generation, but Make
    it Reliable", WACV 2026, https://arxiv.org/abs/2510.23240
    Pippi et al., "Zero-Shot Styled Text Image Generation, but Make It
    Autoregressive" (Emuru), CVPR 2025, https://arxiv.org/abs/2503.17074

Given one image of a line of someone's handwriting and a string, the model
draws that string in the same hand. It is a T5-large encoder-decoder that
reads the text as bytes and autoregressively emits columns of a VAE latent
(each column = 8 px of a 64 px tall line image), using the style image's own
latent columns as the prefix it continues from.

The generation loop is adapted from the reference implementation at
https://huggingface.co/blowing-up-groundhogs/eruku (Apache-2.0), with two
changes: decoder key/value caching, so cost is linear rather than quadratic in
line length, and classifier-free guidance that actually drops the text
condition (in the reference defaults both guidance branches see identical
inputs, so the scale has no effect).

Weights are loaded with ``torch.load(weights_only=True)``; no remote code runs.
"""

import numpy as np
import torch
import torch.nn as nn
from diffusers import AutoencoderKL
from huggingface_hub import hf_hub_download
from PIL import Image
from transformers import AutoTokenizer, DynamicCache, EncoderDecoderCache, T5Config, T5Model

LINE_HEIGHT = 64      # pixels; the VAE was trained on lines of this height
LATENT_STRIDE = 8     # pixels of image width per generated token
LATENT_DIM = 8        # values per token (one latent column)
SOG, EOG, IMG = 0, 1, 2   # "start of generation", "end of generation", image column


class Eruku(nn.Module):
    def __init__(self, t5_config, vae, tokenizer):
        super().__init__()
        d = t5_config.d_model
        self.tokenizer = tokenizer
        self.T5 = T5Model(t5_config)
        self.vae = vae
        self.sos = nn.Embedding(1, d)
        self.sog = nn.Embedding(1, d)
        self.eog = nn.Embedding(1, d)   # present in the checkpoint, unused at inference
        self.uncond_embedding = nn.Embedding(1, d)
        self.query_emb = nn.Linear(LATENT_DIM, d)
        self.t5_to_vae = nn.Linear(d, LATENT_DIM)
        self.t5_to_special = nn.Linear(d, 3)
        # T5 rescales decoder states before its (here removed) vocabulary head.
        self.output_scale = d ** -0.5

    @classmethod
    def from_pretrained(cls):
        tokenizer = AutoTokenizer.from_pretrained("google/byt5-small")
        tokenizer.add_tokens(["<sog>"])
        t5_config = T5Config.from_pretrained("google-t5/t5-large")
        t5_config.vocab_size = len(tokenizer)
        vae = AutoencoderKL.from_pretrained("blowing-up-groundhogs/emuru_vae")
        model = cls(t5_config, vae, tokenizer)
        weights = torch.load(
            hf_hub_download("blowing-up-groundhogs/eruku", "pytorch_model.bin"),
            map_location="cpu",
            weights_only=True,
        )
        missing, unexpected = model.load_state_dict(weights, strict=False)
        if missing or unexpected:
            raise RuntimeError(f"checkpoint mismatch: missing={missing} unexpected={unexpected}")
        return model.eval()

    def _decode_step(self, embeds, encoder_states, encoder_mask, cache):
        out = self.T5.decoder(
            inputs_embeds=embeds,
            encoder_hidden_states=encoder_states,
            encoder_attention_mask=encoder_mask,
            past_key_values=cache,
            use_cache=True,
        )
        return out.last_hidden_state[:, -1:] * self.output_scale

    def write(self, style_image, text, style_text="", guidance=1.0, seed=0, attempts=5):
        """Write one line of `text` in the hand shown in `style_image`.

        Returns (image, ok): a PIL 'L' image cropped to the ink, and whether the
        model ended the line itself. Sometimes it instead falls into a loop and
        draws a rule across the page; those draws are discarded and redrawn up
        to `attempts` times. ok is False if every attempt ran away.

        style_image: one line of handwriting, dark ink on a light background
            (run photos through hwsynth.preprocess.clean_line first).
        style_text: what the style image says. Optional, but it tells the model
            which shapes are which letters.
        guidance: classifier-free guidance on the text; 1.0 disables it.
        """
        for attempt in range(attempts):
            image, finished = self.generate(style_image, text, style_text, guidance, seed + 7919 * attempt)
            if finished:
                break
        return trim(image), finished

    @torch.inference_mode()
    def generate(self, style_image, text, style_text="", guidance=1.0, seed=None):
        """One sampling pass. Returns (untrimmed image, finished)."""
        if seed is not None:
            torch.manual_seed(seed)
        # Measured hands run from 2 columns per character to nearly 5 for wide
        # writing; a line still going at 8 is not coming back.
        max_columns = max(64, 8 * len(text))

        style = style_image.convert("RGB")
        width = max(LINE_HEIGHT, round(LINE_HEIGHT * style.width / style.height))
        width -= width % LATENT_STRIDE
        style = style.resize((width, LINE_HEIGHT), Image.LANCZOS)
        pixels = torch.from_numpy(np.array(style)).permute(2, 0, 1).float() / 127.5 - 1.0
        latent = self.vae.encode(pixels.unsqueeze(0)).latent_dist.sample()      # (1, 1, 8, W/8)
        style_columns = latent[0, 0].T.unsqueeze(0)                             # (1, W/8, 8)

        tokens = self.tokenizer([f"{style_text}<sog>{text}"], return_tensors="pt")
        mask = tokens["attention_mask"]
        text_embeds = self.T5.shared(tokens["input_ids"])
        encoder_states = self.T5.encoder(inputs_embeds=text_embeds, attention_mask=mask).last_hidden_state
        branches = [(encoder_states, self._new_cache())]
        if guidance != 1.0:
            blank = self.uncond_embedding.weight.expand_as(text_embeds)
            blank_states = self.T5.encoder(inputs_embeds=blank, attention_mask=mask).last_hidden_state
            branches.append((blank_states, self._new_cache()))

        sos, sog = self.sos.weight[None], self.sog.weight[None]
        # The prefix is the style line followed by a placeholder column of ones.
        prefix = torch.cat([style_columns, torch.ones(1, 1, LATENT_DIM)], dim=1)
        step_input = torch.cat([sos, self.query_emb(prefix)], dim=1)
        started = not style_text
        if started:   # without a transcript the reference opens generation itself
            step_input = torch.cat([step_input, sog], dim=1)

        # Columns emitted before the model signals SOG continue the style line
        # rather than answer the prompt, so they are kept apart.
        columns, before_start, finished = [], [], False
        for _ in range(max_columns + 2):
            outs = [self._decode_step(step_input, states, mask, cache) for states, cache in branches]
            out = outs[0] if len(outs) == 1 else outs[1] + (outs[0] - outs[1]) * guidance
            kind = self.t5_to_special(out).argmax(dim=-1).item()
            if kind == SOG:
                step_input = sog
                started = True
                continue
            column = self.t5_to_vae(out)
            (columns if started else before_start).append(column)
            if kind == EOG:   # the step that signals the end still carries the last column
                finished = True
                break
            step_input = self.query_emb(column)

        columns = columns or before_start
        if not columns:
            return Image.new("L", (LINE_HEIGHT, LINE_HEIGHT), 255), False
        z = torch.cat(columns, dim=1)[0].T[None, None]                          # (1, 1, 8, N)
        image = self.vae.decode(z).sample.clamp(-1, 1)[0, 0]
        return Image.fromarray(((image + 1) * 127.5).round().byte().numpy(), mode="L"), finished

    def _new_cache(self):
        config = self.T5.decoder.config
        return EncoderDecoderCache(DynamicCache(config=config), DynamicCache(config=config))


def trim(image, threshold=200, pad=8):
    """Crop a generated line to its ink, keeping a small horizontal margin."""
    ink = np.flatnonzero(np.asarray(image).min(axis=0) < threshold)
    if not len(ink):
        return image
    return image.crop((max(ink[0] - pad, 0), 0, min(ink[-1] + pad + 1, image.width), image.height))
