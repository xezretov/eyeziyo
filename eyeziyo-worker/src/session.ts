/**
 * RecordingSession — Durable Object for real-time lesson recording.
 *
 * Each active lesson recording gets its own Durable Object instance that:
 * - Holds the WebSocket connection to the teacher's phone
 * - Accumulates transcript chunks
 * - Forwards audio to Gemini for STT
 * - Manages batch correction and final evaluation
 */

import { transcribeAudio, polishTranscript, evaluateLesson, generateTranscriptionGlossary, type LessonEvaluation } from "./gemini";

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  DB: D1Database;
  JWT_SECRET: string;
}

interface LessonConfig {
  group: string;
  topic: string;
  courseType: string;
  userId: number;
  lessonId: number;
}

// Hard caps to keep memory/Gemini-token usage bounded.
const MAX_TRANSCRIPT_CHARS = 100_000;       // ~25k tokens, ~4-5 hours of speech
const MAX_LESSON_DURATION_SEC = 4 * 3600;   // 4 hours

// A 12-second chunk holds at most ~30 chars/sec of dense speech; 50 is very
// generous. If Gemini returns text far above this, it's hallucinating the
// rest from context — reject the whole chunk rather than poison the transcript.
const MAX_CHARS_PER_SEC = 50;
const ASSUMED_CHUNK_SEC = 12;
const HALLUCINATION_CHAR_CAP = MAX_CHARS_PER_SEC * ASSUMED_CHUNK_SEC * 2; // 1200

export class RecordingSession {
  state: DurableObjectState;
  env: Env;
  ws: WebSocket | null = null;
  transcript = "";
  transcriptTruncated = false;
  chunksReceived = 0;
  // Wall-clock start of recording — set on first audio chunk. Trusted.
  startedAtMs = 0;
  // Authenticated user_id injected by the worker at WS upgrade. Trusted.
  authenticatedUserId = 0;
  config: LessonConfig = { group: "", topic: "", courseType: "", userId: 0, lessonId: 0 };
  // Proper-noun glossary generated once from course+topic and injected into
  // every chunk's transcription prompt. `glossaryReady` lets the first audio
  // chunk wait for generation without blocking config_ack.
  glossary = "";
  glossaryReady: Promise<void> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const uidHeader = request.headers.get("X-User-Id");
    if (uidHeader) {
      const parsed = parseInt(uidHeader, 10);
      if (!isNaN(parsed) && parsed > 0) this.authenticatedUserId = parsed;
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ws = server;
    server.accept();

    server.addEventListener("message", (event) => this.handleMessage(event));
    server.addEventListener("close", () => {
      this.ws = null;
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(event: MessageEvent) {
    const ws = this.ws;
    if (!ws) return;

    // Binary = audio chunk
    if (event.data instanceof ArrayBuffer) {
      await this.handleAudioChunk(event.data);
      return;
    }

    // Text = JSON command
    try {
      const data = JSON.parse(event.data as string);
      const type = data.type || "";

      if (type === "config") {
        this.config = {
          group: (data.group || "").trim(),
          topic: (data.topic || "").trim(),
          courseType: (data.course_type || "Backend dasturlash").trim(),
          userId: data.user_id || 0,
          lessonId: data.lesson_id || 0,
        };
        // Kick off proper-noun glossary generation (fire-and-forget). The
        // first audio chunk awaits `glossaryReady`; later chunks reuse it.
        this.glossaryReady = generateTranscriptionGlossary(
          this.env.GEMINI_API_KEY,
          this.config.courseType,
          this.config.topic
        )
          .then((g) => { this.glossary = g; })
          .catch(() => { this.glossary = ""; });
        ws.send(JSON.stringify({ type: "config_ack", status: "ok" }));
      } else if (type === "finish") {
        await this.handleFinish(data);
      }
    } catch {
      // ignore parse errors
    }
  }

  private async handleAudioChunk(wavBytes: ArrayBuffer) {
    const ws = this.ws;
    if (!ws) return;

    if (this.startedAtMs === 0) this.startedAtMs = Date.now();

    // Refuse further audio if we've already filled the transcript buffer.
    if (this.transcriptTruncated) {
      ws.send(JSON.stringify({
        type: "transcript",
        stage: "skipped",
        text: "",
        full: this.transcript,
        chunk: this.chunksReceived,
        warning: "transcript_limit_reached",
      }));
      return;
    }

    ws.send(JSON.stringify({ type: "processing" }));

    // Convert to base64 for Gemini
    const bytes = new Uint8Array(wavBytes);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const audioBase64 = btoa(binary);

    // Wait for the proper-noun glossary (only blocks on the first chunk).
    if (this.glossaryReady) {
      try { await this.glossaryReady; } catch { /* glossary optional */ }
    }

    // Transcribe via Gemini. Pass the tail of the running transcript so
    // the model knows what was already said and doesn't re-render the
    // overlap from the previous chunk, plus the topic glossary so proper
    // nouns are spelled consistently.
    const text = await transcribeAudio(
      this.env.GEMINI_API_KEY,
      audioBase64,
      this.config.courseType,
      this.config.topic,
      this.transcript.slice(-200),
      this.glossary
    );

    this.chunksReceived++;
    const rawText = text || "";

    if (!rawText.trim()) {
      ws.send(JSON.stringify({
        type: "transcript",
        stage: "skipped",
        text: "",
        full: this.transcript,
        chunk: this.chunksReceived,
      }));
      return;
    }

    // Hallucination cap: a 12s chunk physically can't hold more than
    // ~600 chars of speech. If Gemini returned far more, it stitched in
    // material from its training data — drop the chunk entirely.
    if (rawText.length > HALLUCINATION_CHAR_CAP) {
      ws.send(JSON.stringify({
        type: "transcript",
        stage: "skipped",
        text: "",
        full: this.transcript,
        chunk: this.chunksReceived,
        warning: "hallucination_suspected",
      }));
      return;
    }

    // Append to running transcript. Dedup the chunk's leading overlap against
    // the tail of the running transcript — client sends 0.5s of audio overlap
    // between chunks, so some words at the boundary may be re-transcribed.
    const overlap = this.transcript.slice(-80);
    const words = rawText.split(/\s+/).filter(Boolean);
    let startIdx = 0;
    for (let len = 1; len <= Math.min(10, words.length); len++) {
      const head = words.slice(0, len).join(" ");
      if (overlap.endsWith(head)) {
        startIdx = len;
      }
    }
    const deduped = words.slice(startIdx).join(" ");

    // Cross-chunk loop guard: Gemini sometimes returns the same paragraph for
    // several consecutive chunks when audio is unclear. The leading-overlap
    // dedup above won't catch it because the new chunk starts with a phrase
    // that appears earlier (not at the very end) in the transcript. So we
    // also check whether the first 60 chars of the new chunk already exist
    // anywhere in the last 600 chars — if yes, treat as repeat and skip.
    if (deduped.length >= 60) {
      const probe = deduped.slice(0, 60);
      const recentTail = this.transcript.slice(-600);
      if (recentTail.includes(probe)) {
        ws.send(JSON.stringify({
          type: "transcript",
          stage: "skipped",
          text: "",
          full: this.transcript,
          chunk: this.chunksReceived,
          warning: "duplicate_of_recent",
        }));
        return;
      }
    }

    if (deduped) {
      const sep = this.transcript ? " " : "";
      const remaining = MAX_TRANSCRIPT_CHARS - this.transcript.length - sep.length;
      if (remaining <= 0) {
        this.transcriptTruncated = true;
      } else if (deduped.length <= remaining) {
        this.transcript += sep + deduped;
      } else {
        this.transcript += sep + deduped.slice(0, remaining);
        this.transcriptTruncated = true;
      }
    }

    ws.send(JSON.stringify({
      type: "transcript",
      stage: "raw",
      raw_text: rawText,
      text: deduped,
      full: this.transcript,
      chunk: this.chunksReceived,
    }));
  }

  private async handleFinish(data: any) {
    const ws = this.ws;
    if (!ws) return;

    // Authoritative duration: wall-clock from first chunk to now.
    // Falls back to chunk count if startedAtMs wasn't set (no audio received).
    let durationSeconds: number;
    if (this.startedAtMs > 0) {
      durationSeconds = Math.round((Date.now() - this.startedAtMs) / 1000);
    } else {
      durationSeconds = this.chunksReceived * 12;
    }
    if (durationSeconds > MAX_LESSON_DURATION_SEC) durationSeconds = MAX_LESSON_DURATION_SEC;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    // Minimum duration check
    if (durationSeconds < 60) {
      ws.send(JSON.stringify({
        type: "error",
        code: "lesson_too_short",
        message: `Dars juda qisqa. Kamida 60 soniya yozish kerak.`,
      }));
      return;
    }

    ws.send(JSON.stringify({ type: "polishing", message: "Transkript tahrir qilinmoqda..." }));

    // Polish: remove accidental sentence-level duplicates and fix punctuation.
    // Never expands the text (guarded in polishTranscript).
    try {
      const polished = await polishTranscript(
        this.env.GEMINI_API_KEY,
        this.transcript,
        this.config.courseType,
        this.config.topic
      );
      if (polished && polished.trim()) this.transcript = polished;
    } catch (e) {
      console.error("Polish failed, keeping raw:", e);
    }

    ws.send(JSON.stringify({ type: "evaluating", message: "AI darsni baholamoqda..." }));

    // Evaluate
    const evaluation = await evaluateLesson(
      this.env.GEMINI_API_KEY,
      this.transcript,
      this.config.courseType,
      this.config.topic,
      durationMinutes
    );

    // Save to D1
    try {
      await this.saveToDb(durationSeconds, evaluation);
    } catch (e) {
      console.error("DB save error:", e);
    }

    ws.send(JSON.stringify({
      type: "evaluation",
      overall_score: evaluation.overall_score,
      topic_score: evaluation.topic_score,
      speech_score: evaluation.speech_score,
      method_score: evaluation.method_score,
      interaction_score: evaluation.interaction_score,
      feedback_score: evaluation.feedback_score,
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      advice: evaluation.advice,
      full_transcript: this.transcript,
    }));
  }

  private async saveToDb(durationSeconds: number, evaluation: LessonEvaluation) {
    const db = this.env.DB;

    let lessonId = this.config.lessonId;

    // If no lessonId was provided (mobile app doesn't send it),
    // create the lesson record now.
    if (!lessonId) {
      // Prefer the authenticated user from the WS upgrade (trusted).
      // Fall back to config only if header was missing (older clients).
      let userId = this.authenticatedUserId || this.config.userId || 0;
      if (!userId) {
        console.error("saveToDb: no authenticated user_id, refusing to save lesson");
        throw new Error("no_authenticated_user");
      }

      const result = await db.prepare(
        "INSERT INTO lessons (user_id, group_name, topic, course_type, transcript, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(
        userId,
        this.config.group || "",
        this.config.topic || "",
        this.config.courseType || "",
        this.transcript,
        durationSeconds
      ).run();

      lessonId = result.meta.last_row_id as number;
    } else {
      // Update existing lesson — but only if it belongs to the authenticated
      // user. Without the user_id guard a teacher could pass another teacher's
      // lesson_id in `config` and overwrite their transcript/evaluation (IDOR).
      const ownerId = this.authenticatedUserId || this.config.userId || 0;
      if (!ownerId) {
        console.error("saveToDb: no authenticated user_id, refusing to update lesson");
        throw new Error("no_authenticated_user");
      }
      const res = await db.prepare(
        "UPDATE lessons SET transcript = ?, duration_seconds = ? WHERE id = ? AND user_id = ?"
      ).bind(this.transcript, durationSeconds, lessonId, ownerId).run();
      if (!res.meta || res.meta.changes === 0) {
        console.error("saveToDb: lesson not owned by user, refusing to save", { lessonId, ownerId });
        throw new Error("lesson_not_owned");
      }
    }

    // Insert evaluation
    if (lessonId) {
      await db.prepare(`
        INSERT OR REPLACE INTO evaluations
        (lesson_id, overall_score, topic_score, speech_score, method_score, interaction_score, feedback_score, summary, strengths, improvements, advice)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        lessonId,
        evaluation.overall_score,
        evaluation.topic_score,
        evaluation.speech_score,
        evaluation.method_score,
        evaluation.interaction_score,
        evaluation.feedback_score,
        evaluation.summary,
        JSON.stringify(evaluation.strengths),
        JSON.stringify(evaluation.improvements),
        JSON.stringify(evaluation.advice)
      ).run();
    }
  }
}
