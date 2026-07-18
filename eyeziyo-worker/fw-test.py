"""
faster-whisper (CTranslate2) GPU test — Whisper large-v3, Uzbek.
VAD-asosli long-form: kontent tashlamaydi, early-stop yo'q.

    python fw-test.py <audio> --model=large-v3 --out=out.txt
"""
import sys, os, argparse, time
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument("audio")
ap.add_argument("--model", default="large-v3")
ap.add_argument("--out", default="fw-output.txt")
ap.add_argument("--compute", default="int8_float16")  # 8GB ga mos
args = ap.parse_args()

print(f"[load] {args.model} (cuda, {args.compute})...")
t0 = time.time()
model = WhisperModel(args.model, device="cuda", compute_type=args.compute)
print(f"[load] {time.time()-t0:.1f}s")

t1 = time.time()
segments, info = model.transcribe(
    args.audio,
    language="uz",
    beam_size=5,
    vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=500),
)
print(f"[info] til={info.language} ({info.language_probability:.2f}), audio={info.duration:.1f}s")

parts = []
for seg in segments:
    parts.append(seg.text.strip())
text = " ".join(parts).strip()
dt = time.time() - t1
# Write the file FIRST (utf-8) so a console encoding error can't lose the result.
with open(args.out, "w", encoding="utf-8") as f:
    f.write(text)
print(f"[transcribe] {dt:.1f}s  ({info.duration/dt:.1f}x realtime)  |  {len(text)} belgi")
# Safe console print: strip chars the terminal codepage can't encode.
try:
    print(text)
except UnicodeEncodeError:
    print(text.encode("ascii", "replace").decode("ascii"))
print(f"\n[done] -> {args.out}")
