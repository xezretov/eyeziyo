"""
Aisha Whisper-Uzbek bilan transkripsiya qilish.

Foydalanish:
    python transcribe-aisha.py <audio.wav> [--out=output.txt] [--chunk=30]

- 8000 Hz mono WAV faylni qabul qiladi
- 16000 Hz ga resample qiladi (Whisper'ning standart kirishi)
- Uzun audioni 30-soniyali bo'laklarga bo'lib transkripsiya qiladi
- Natijani matn fayliga yozadi va konsolga chiqaradi
"""

import sys
import os
import argparse
import time
import wave

import numpy as np
import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration

MODEL_ID = "aisha-org/Whisper-Uzbek"
TARGET_SR = 16000  # Whisper kirish sample rate

def read_wav(path: str):
    """8000 Hz mono int16 WAV ni o'qib, float32 numpy array qaytaradi."""
    with wave.open(path, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        n = wf.getnframes()
        raw = wf.readframes(n)

    print(f"[wav] sr={sr} channels={ch} sample_width={sw} frames={n}")

    if sw == 2:
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        audio = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sw == 1:
        audio = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128) / 128.0
    else:
        raise ValueError(f"Qo'llab-quvvatlanmaydigan sample_width: {sw}")

    if ch == 2:
        audio = audio.reshape(-1, 2).mean(axis=1)

    return audio, sr


def resample_linear(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    """Oddiy chiziqli resampling. Sifat torch bilan emas, lekin tezroq va sodda."""
    if src_sr == dst_sr:
        return audio
    duration = len(audio) / src_sr
    new_len = int(duration * dst_sr)
    old_idx = np.linspace(0, len(audio) - 1, new_len)
    return np.interp(old_idx, np.arange(len(audio)), audio).astype(np.float32)


def transcribe_chunked(audio16k: np.ndarray, chunk_sec: int, out_path: str):
    print(f"[load] Modelni yuklayapman: {MODEL_ID}")
    t0 = time.time()
    processor = WhisperProcessor.from_pretrained(MODEL_ID)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID)
    model.eval()
    print(f"[load] Yuklandi: {time.time() - t0:.1f}s")

    chunk_samples = chunk_sec * TARGET_SR
    total = len(audio16k)
    num_chunks = (total + chunk_samples - 1) // chunk_samples
    print(f"[chunk] Jami {num_chunks} ta bo'lak, har biri {chunk_sec}s")

    all_text = []
    with open(out_path, "w", encoding="utf-8") as fout:
        for i in range(num_chunks):
            start = i * chunk_samples
            end = min(start + chunk_samples, total)
            chunk = audio16k[start:end]

            t1 = time.time()
            inputs = processor(chunk, sampling_rate=TARGET_SR, return_tensors="pt")
            with torch.no_grad():
                ids = model.generate(
                    inputs.input_features,
                    language="uz",
                    task="transcribe",
                    max_new_tokens=440,
                )
            text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            dur = time.time() - t1

            print(f"[chunk {i + 1}/{num_chunks}] {dur:.1f}s  -> {text[:80]!r}{'...' if len(text) > 80 else ''}")
            all_text.append(text)
            fout.write(text + "\n")
            fout.flush()

    return " ".join(all_text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", help="WAV fayl yo'li")
    ap.add_argument("--out", default="aisha-output.txt", help="Chiqish fayli")
    ap.add_argument("--chunk", type=int, default=30, help="Bo'lak uzunligi (soniya)")
    args = ap.parse_args()

    if not os.path.exists(args.audio):
        print(f"XATO: fayl topilmadi: {args.audio}")
        sys.exit(1)

    print(f"[start] {args.audio}")
    audio, sr = read_wav(args.audio)
    print(f"[wav] davomiyligi: {len(audio) / sr:.1f}s")

    audio16k = resample_linear(audio, sr, TARGET_SR)
    print(f"[resample] {sr} Hz -> {TARGET_SR} Hz, namunalar: {len(audio16k)}")

    full = transcribe_chunked(audio16k, args.chunk, args.out)
    print(f"\n[done] Chiqish: {args.out}")
    print(f"[done] Jami uzunlik: {len(full)} belgi")


if __name__ == "__main__":
    main()
