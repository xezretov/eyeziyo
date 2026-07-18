"""
Aisha Whisper-Uzbek — to'g'ri long-form pipeline bilan (early-stop muammosini
oldini oladi). transformers ASR pipeline chunk_length_s + stride bilan
overlap-and-stitch qiladi.

    python aisha-pipeline.py <audio.wav> --out=out.txt
"""
import sys, os, argparse, time, wave
import numpy as np
from transformers import pipeline

MODEL_ID = "aisha-org/Whisper-Uzbek"
SR = 16000

def read_wav_16k(path):
    with wave.open(path, "rb") as wf:
        sr, ch, sw, n = wf.getframerate(), wf.getnchannels(), wf.getsampwidth(), wf.getnframes()
        raw = wf.readframes(n)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch == 2:
        audio = audio.reshape(-1, 2).mean(axis=1)
    if sr != SR:
        dur = len(audio) / sr
        audio = np.interp(np.linspace(0, len(audio) - 1, int(dur * SR)),
                          np.arange(len(audio)), audio).astype(np.float32)
    return audio

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", default="aisha-pipe.txt")
    args = ap.parse_args()

    audio = read_wav_16k(args.audio)
    print(f"[wav] {len(audio)/SR:.1f}s")

    t0 = time.time()
    pipe = pipeline(
        "automatic-speech-recognition",
        model=MODEL_ID,
        chunk_length_s=30,
        stride_length_s=5,
    )
    print(f"[load] {time.time()-t0:.1f}s")

    t1 = time.time()
    res = pipe(audio, batch_size=4, generate_kwargs={"language": "uz", "task": "transcribe"})
    text = res["text"].strip()
    print(f"[transcribe] {time.time()-t1:.1f}s | {len(text)} belgi\n")
    print(text)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"\n[done] -> {args.out}")

if __name__ == "__main__":
    main()
