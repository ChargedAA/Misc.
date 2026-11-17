"""Measure the image-based imitator on real handwriting it has not seen.

For each test writer we take two consecutive lines from the IAM test split.
Line A is the style reference. The model is asked to write the text of line B,
and the result is put next to the real line B (same writer, same words).
Legibility is scored by reading every generated line back with a handwriting
OCR model (TrOCR) and computing the character error rate against the prompt;
the real line B is read the same way as a human baseline.

    python evaluate.py --data eval_data --out eval_out

IAM is free for non-commercial research use; this script downloads the handful
of lines it needs and does not redistribute them.
"""

import argparse
import json
import os
import re
import urllib.parse
import urllib.request

import torch
from PIL import Image, ImageDraw
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

from hwsynth.eruku import Eruku
from hwsynth.preprocess import clean_line

# Row offsets in Teklia/IAM-line (test) where rows i and i+1 are the same writer
# (checked by eye). Each is a different writer.
WRITER_OFFSETS = [0, 300, 700, 1100, 1500, 1900, 2300]
PANGRAM = "The quick brown fox jumps over the lazy dog"
MAIN = "cleaned + transcript"
VARIANTS = {
    MAIN: dict(clean=True, use_transcript=True, guidance=1.0),
    "cleaned, no transcript": dict(clean=True, use_transcript=False, guidance=1.0),
    "cleaned + transcript + guidance 1.25": dict(clean=True, use_transcript=True, guidance=1.25),
    "raw scan + transcript": dict(clean=False, use_transcript=True, guidance=1.0),
}


def fetch_pairs(data_dir):
    os.makedirs(data_dir, exist_ok=True)
    meta_path = os.path.join(data_dir, "meta.json")
    if os.path.exists(meta_path):
        return json.load(open(meta_path))
    meta = {}
    for offset in WRITER_OFFSETS:
        url = (
            "https://datasets-server.huggingface.co/rows?dataset="
            + urllib.parse.quote("Teklia/IAM-line", safe="")
            + f"&config=default&split=test&offset={offset}&length=2"
        )
        rows = json.load(urllib.request.urlopen(url, timeout=60))["rows"]
        for j, row in enumerate(rows):
            name = f"w{offset:04d}_{j}.jpg"
            urllib.request.urlretrieve(row["row"]["image"]["src"], os.path.join(data_dir, name))
            meta[name] = row["row"]["text"]
    json.dump(meta, open(meta_path, "w"), indent=1)
    return meta


def detokenise(text):
    """IAM transcripts are space-separated tokens: 'one , but it 's' -> "one, but it's"."""
    text = re.sub(r" ([,.;:!?)])", r"\1", text)
    text = re.sub(r"\( ", "(", text)
    text = re.sub(r" ('s|n't|'re|'ve|'ll|'d|'m)\b", r"\1", text)
    text = re.sub(r'" (.*?) "', r'"\1"', text)
    return text.strip()


def cer(reference, hypothesis):
    """Character error rate: edit distance / reference length."""
    prev = list(range(len(hypothesis) + 1))
    for i, r in enumerate(reference, 1):
        cur = [i]
        for j, h in enumerate(hypothesis, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / max(len(reference), 1)


class Reader:
    def __init__(self, name="microsoft/trocr-base-handwritten"):
        self.processor = TrOCRProcessor.from_pretrained(name)
        self.model = VisionEncoderDecoderModel.from_pretrained(name, use_safetensors=True).eval()

    @torch.inference_mode()
    def read(self, image):
        pixels = self.processor(images=image.convert("RGB"), return_tensors="pt").pixel_values
        ids = self.model.generate(pixels, max_new_tokens=96)
        # TrOCR learned IAM's spacing ("one , but"), so undo it as for the prompts.
        return detokenise(self.processor.batch_decode(ids, skip_special_tokens=True)[0])


def contact_sheet(rows, path, row_height=64):
    rows = [(label, im.convert("L").resize((round(im.width * row_height / im.height), row_height), Image.LANCZOS))
            for label, im in rows]
    sheet = Image.new("L", (max(im.width for _, im in rows) + 20, len(rows) * (row_height + 24) + 8), 255)
    draw = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(rows):
        y = 4 + i * (row_height + 24)
        draw.text((10, y), label, fill=80)
        sheet.paste(im, (10, y + 14))
    sheet.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data", default="eval_data")
    parser.add_argument("--out", default="eval_out")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)

    meta = fetch_pairs(args.data)
    model, reader = Eruku.from_pretrained(), Reader()
    scores = {name: [] for name in VARIANTS}
    runaways = {name: 0 for name in VARIANTS}
    human, results = [], []

    for offset in WRITER_OFFSETS:
        line_a = Image.open(os.path.join(args.data, f"w{offset:04d}_0.jpg"))
        line_b = Image.open(os.path.join(args.data, f"w{offset:04d}_1.jpg"))
        text_a, text_b = (detokenise(meta[f"w{offset:04d}_{j}.jpg"]) for j in (0, 1))
        cleaned = clean_line(line_a)

        read_b = reader.read(line_b)
        human.append(cer(text_b, read_b))
        sheet = [("style reference: one real line, cleaned", cleaned),
                 (f"real next line by the same writer   [OCR error {human[-1]:.0%}]", line_b)]

        for name, v in VARIANTS.items():
            style = cleaned if v["clean"] else line_a
            errors = []
            for prompt in (text_b, PANGRAM):
                # A single attempt, so that runaway generations are counted rather than hidden.
                image, ok = model.write(style, prompt, text_a if v["use_transcript"] else "", v["guidance"],
                                        seed=args.seed, attempts=1)
                read = reader.read(image)
                errors.append(min(cer(prompt, read), 1.0))
                runaways[name] += not ok
                results.append(dict(writer=offset, variant=name, prompt=prompt, read=read, cer=errors[-1], finished=ok))
                if name == MAIN:
                    sheet.append((f"generated: {prompt!r}   [OCR error {errors[-1]:.0%}]", image))
            scores[name].extend(errors)
            print(f"writer {offset:4d}  {name:38s} CER {errors[0]:.1%} / {errors[1]:.1%}", flush=True)

        contact_sheet(sheet, os.path.join(args.out, f"writer_{offset:04d}.png"))

    n = 2 * len(WRITER_OFFSETS)
    summary = {name: dict(mean_cer=sum(v) / n, runaways=runaways[name], lines=n) for name, v in scores.items()}
    summary["real handwriting (human baseline)"] = dict(mean_cer=sum(human) / len(human), lines=len(human))
    json.dump(dict(summary=summary, results=results), open(os.path.join(args.out, "results.json"), "w"), indent=1)
    print("\ncharacter error rate when the output is read back by TrOCR:")
    for name, s in summary.items():
        extra = f"   runaway lines: {s['runaways']}/{s['lines']}" if "runaways" in s else ""
        print(f"  {name:38s} {s['mean_cer']:.1%}{extra}")


if __name__ == "__main__":
    main()
