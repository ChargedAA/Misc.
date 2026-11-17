"""Stroke-based ("online") handwriting synthesis, after Graves 2013.

    Alex Graves, "Generating Sequences With Recurrent Neural Networks"
    https://arxiv.org/abs/1308.0850  (section 5: handwriting synthesis)

This is an inference-only re-implementation of the synthesis network:
three peephole-LSTM layers, a soft attention window over the one-hot text,
and a mixture-density output over pen offsets (dx, dy, pen-up).

Parameter names match the checkpoints published with
https://github.com/X-rayLaser/pytorch-handwriting-synthesis-toolkit (MIT),
so those weights load directly. Checkpoints are read with
``torch.load(weights_only=True)``; no third-party code is executed.

A sample is a float tensor of shape (T, 3): pen offsets (dx, dy) in the
training data's coordinate units, and a flag that is 1 on the last point
of each stroke (pen lifts after it).
"""

import json
import math
import os

import torch
import torch.nn as nn
import torch.nn.functional as F


class PeepholeLSTM(nn.Module):
    def __init__(self, input_size, hidden_size):
        super().__init__()
        self.hidden_size = hidden_size
        self.W_ci = nn.Parameter(torch.zeros(hidden_size))
        self.b_i = nn.Parameter(torch.zeros(hidden_size))
        self.W_cf = nn.Parameter(torch.zeros(hidden_size))
        self.b_f = nn.Parameter(torch.zeros(hidden_size))
        self.b_c = nn.Parameter(torch.zeros(hidden_size))
        self.W_co = nn.Parameter(torch.zeros(hidden_size))
        self.b_o = nn.Parameter(torch.zeros(hidden_size))
        self.W_xh = nn.Parameter(torch.zeros(input_size + hidden_size, hidden_size * 4))

    def step(self, x, state):
        h, c = state
        z_i, z_f, z_c, z_o = (torch.cat([x, h], dim=1) @ self.W_xh).chunk(4, dim=1)
        i = torch.sigmoid(z_i + c * self.W_ci + self.b_i)
        f = torch.sigmoid(z_f + c * self.W_cf + self.b_f)
        c = f * c + i * torch.tanh(z_c + self.b_c)
        o = torch.sigmoid(z_o + c * self.W_co + self.b_o)
        return o * torch.tanh(c), c


class SoftWindow(nn.Module):
    def __init__(self, input_size, num_components):
        super().__init__()
        self.alpha = nn.Linear(input_size, num_components)
        self.beta = nn.Linear(input_size, num_components)
        self.k = nn.Linear(input_size, num_components)

    def step(self, h, prev_k, num_chars):
        alpha = torch.exp(self.alpha(h)).unsqueeze(2)
        beta = torch.exp(self.beta(h)).unsqueeze(2)
        k = prev_k + torch.exp(self.k(h))
        u = torch.arange(num_chars, device=h.device)
        phi = (alpha * torch.exp(-beta * (k.unsqueeze(2) - u) ** 2)).sum(dim=1)
        return phi, k


class MixtureDensityLayer(nn.Module):
    def __init__(self, input_size, num_components):
        super().__init__()
        self.num_components = num_components
        self.pi = nn.Linear(input_size, num_components)
        self.mu = nn.Linear(input_size, num_components * 2)
        self.sd = nn.Linear(input_size, num_components * 2)
        self.ro = nn.Linear(input_size, num_components)
        self.eos = nn.Linear(input_size, 1)

    def forward(self, x, bias=0.0):
        # Graves' probability bias: 0 = sample the learned distribution,
        # larger = neater, more "average" handwriting.
        pi = F.softmax(self.pi(x) * (1 + bias), dim=-1)
        sd = torch.exp(self.sd(x) - bias)
        return pi, self.mu(x), sd, torch.tanh(self.ro(x)), torch.sigmoid(self.eos(x))


class SynthesisNetwork(nn.Module):
    def __init__(self, alphabet_size, hidden_size=400, window_components=10, output_mixtures=20):
        super().__init__()
        self.alphabet_size = alphabet_size
        self.hidden_size = hidden_size
        self.window_components = window_components
        self.lstm1 = PeepholeLSTM(3 + alphabet_size, hidden_size)
        self.window = SoftWindow(hidden_size, window_components)
        self.lstm2 = PeepholeLSTM(3 + hidden_size + alphabet_size, hidden_size)
        self.lstm3 = PeepholeLSTM(3 + hidden_size + alphabet_size, hidden_size)
        self.mixture = MixtureDensityLayer(hidden_size * 3, output_mixtures)

    def initial_state(self):
        zeros = lambda n: torch.zeros(1, n)
        return {
            "lstm": [(zeros(self.hidden_size), zeros(self.hidden_size)) for _ in range(3)],
            "k": zeros(self.window_components),
            "w": zeros(self.alphabet_size),
        }

    def step(self, x, c, state, bias=0.0):
        """Advance one pen point. x: (1, 3) normalised point, c: (U, alphabet) one-hot text."""
        s1, s2, s3 = state["lstm"]
        h1, c1 = self.lstm1.step(torch.cat([x, state["w"]], dim=1), s1)
        phi, k = self.window.step(h1, state["k"], c.shape[0])
        w = phi @ c
        h2, c2 = self.lstm2.step(torch.cat([x, h1, w], dim=1), s2)
        h3, c3 = self.lstm3.step(torch.cat([x, h2, w], dim=1), s3)
        mixture = self.mixture(torch.cat([h1, h2, h3], dim=1), bias)
        state = {"lstm": [(h1, c1), (h2, c2), (h3, c3)], "k": k, "w": w}
        return mixture, phi[0], state


def sample_point(mixture, generator=None):
    pi, mu, sd, ro, eos = (t[0] for t in mixture)
    n = pi.shape[0]
    j = torch.multinomial(pi, 1, generator=generator).item()
    z = torch.randn(2, generator=generator)
    rho = ro[j]
    dx = mu[j] + sd[j] * z[0]
    dy = mu[j + n] + sd[j + n] * (rho * z[0] + math.sqrt(max(1.0 - rho.item() ** 2, 0.0)) * z[1])
    # The published checkpoints were tuned with a thresholded pen-up decision.
    return torch.stack([dx, dy, (eos[0] > 0.5).float()])


class Handwriter:
    """Text -> pen strokes, optionally continuing in the style of a priming sample."""

    # Trailing spaces give the attention window somewhere to land, so the last
    # letter is finished before generation stops.
    SENTINEL = "  "

    # In the training data's units a written line is 350-900 tall, descenders
    # included. A sample that wanders further than this has left the line.
    MAX_LINE_HEIGHT = 1300.0

    def __init__(self, model, mu, std, charset):
        self.model = model.eval()
        self.mu = mu
        self.std = std
        self.charset = charset
        self.char_to_index = {ch: i + 1 for i, ch in enumerate(charset)}  # 0 = unknown

    @classmethod
    def load(cls, checkpoint_dir):
        with open(os.path.join(checkpoint_dir, "meta.json")) as f:
            meta = json.load(f)
        model = SynthesisNetwork(alphabet_size=len(meta["charset"]) + 1)
        weights = torch.load(os.path.join(checkpoint_dir, "model.pt"), map_location="cpu", weights_only=True)
        model.load_state_dict(weights)
        return cls(model, torch.tensor(meta["mu"]), torch.tensor(meta["std"]), meta["charset"])

    def unsupported(self, text):
        return sorted({ch for ch in text if ch not in self.char_to_index})

    def encode(self, text):
        index = torch.tensor([self.char_to_index.get(ch, 0) for ch in text])
        return F.one_hot(index, self.model.alphabet_size).float()

    def normalise(self, strokes):
        return (strokes - self.mu) / self.std

    def denormalise(self, strokes):
        return strokes * self.std + self.mu

    def write(self, text, bias=1.0, prime=None, seed=None, attempts=4):
        """Generate strokes for one line of text. Returns (strokes, ok).

        prime: optional (strokes, transcript) pair, strokes as returned by this
        method. The network is first fed that sample as if it had just written
        it, so the new text continues in the same hand (Graves section 5.5).

        Now and then the sampler loses its place in the text and scribbles
        instead of finishing. Such a draw is thrown away and redrawn, up to
        `attempts` times; ok is False if every attempt derailed. This matters
        most for a sample used as a prime: priming on a derailed sample
        derails every line that follows.
        """
        for attempt in range(attempts):
            strokes, ok = self._sample(text, bias, prime, None if seed is None else seed + 7919 * attempt)
            y = strokes[:, 1].cumsum(0)
            ok = ok and (y.max() - y.min()).item() <= self.MAX_LINE_HEIGHT
            if ok:
                break
        return strokes, ok

    @torch.no_grad()
    def _sample(self, text, bias, prime, seed):
        generator = torch.Generator().manual_seed(seed) if seed is not None else None
        model = self.model
        state = model.initial_state()
        x = torch.zeros(1, 3)
        full_text = text + self.SENTINEL
        # Healthy samples use 25-30 pen points per character; derailed ones
        # run to twice that or never stop.
        max_steps = 45 * len(full_text) + 100

        if prime is None:
            c = self.encode(full_text)
        else:
            prime_strokes, prime_text = prime
            c = self.encode(prime_text + self.SENTINEL + full_text)
            for point in self.normalise(prime_strokes):
                _, _, state = model.step(x, c, state, bias)
                x = point.unsqueeze(0)

        last_char = c.shape[0] - 1
        points, finished = [], False
        for _ in range(max_steps):
            mixture, phi, state = model.step(x, c, state, bias)
            point = sample_point(mixture, generator)
            finished = bool(phi[last_char] > 0.8 or (phi.argmax() == last_char and point[2] > 0.5))
            if finished:
                point[2] = 1.0
            points.append(point)
            if finished:
                break
            x = point.unsqueeze(0)
        # Crossing the sentinel spaces leaves a lone pen-down point; drop it.
        if len(points) > 1 and points[-2][2] > 0.5:
            points.pop()
        return self.denormalise(torch.stack(points)), finished
