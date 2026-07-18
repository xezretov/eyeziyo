package com.example.eyeziyo.ui.screens

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.eyeziyo.data.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

data class LessonEvaluation(
    val overallScore: Int = 0,
    val clarityScore: Int = 0,
    val engagementScore: Int = 0,
    val contentScore: Int = 0,
    val summary: String = "",
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    val advice: List<String> = emptyList()
)

class RecordingViewModel : ViewModel() {

    companion object {
        private const val TAG = "EyeziyoRec"
        private const val MAX_RECONNECT_ATTEMPTS = 5
    }

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _isPaused = MutableStateFlow(false)
    val isPaused: StateFlow<Boolean> = _isPaused.asStateFlow()

    private val _elapsedSeconds = MutableStateFlow(0)
    val elapsedSeconds: StateFlow<Int> = _elapsedSeconds.asStateFlow()

    private val _rawTranscript = MutableStateFlow("")
    val rawTranscript: StateFlow<String> = _rawTranscript.asStateFlow()

    private val _transcript = MutableStateFlow("")
    val transcript: StateFlow<String> = _transcript.asStateFlow()

    private val _correctionConfidence = MutableStateFlow(0f)
    val correctionConfidence: StateFlow<Float> = _correctionConfidence.asStateFlow()

    private val _currentStage = MutableStateFlow("idle")
    val currentStage: StateFlow<String> = _currentStage.asStateFlow()

    private val _engagementScore = MutableStateFlow(0)
    val engagementScore: StateFlow<Int> = _engagementScore.asStateFlow()

    private val _teacherRatio = MutableStateFlow(0)
    val teacherRatio: StateFlow<Int> = _teacherRatio.asStateFlow()

    private val _studentRatio = MutableStateFlow(0)
    val studentRatio: StateFlow<Int> = _studentRatio.asStateFlow()

    private val _connectionState = MutableStateFlow("Ulanmagan")
    val connectionState: StateFlow<String> = _connectionState.asStateFlow()

    private val _evaluation = MutableStateFlow<LessonEvaluation?>(null)
    val evaluation: StateFlow<LessonEvaluation?> = _evaluation.asStateFlow()

    private val _isEvaluating = MutableStateFlow(false)
    val isEvaluating: StateFlow<Boolean> = _isEvaluating.asStateFlow()

    private var audioRecord: AudioRecord? = null
    private var recordingJob: Job? = null
    private var timerJob: Job? = null

    private val sampleRate = 16000

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS) // Keep WebSocket alive
        .retryOnConnectionFailure(true)
        .build()
    private var webSocket: WebSocket? = null

    // Thread-safe stop signal
    private val stopRequested = AtomicBoolean(false)

    // Track sent vs processed chunks to ensure no audio is skipped
    private val chunksSent = AtomicInteger(0)
    private val chunksProcessed = AtomicInteger(0)

    // Reconnect tracking
    private var reconnectAttempt = 0
    private val pendingChunks = java.util.Collections.synchronizedList(mutableListOf<ByteArray>())
    @Volatile
    private var wsConnected = false

    // Lesson context
    private var groupName: String = ""
    private var topicName: String = ""
    private var courseType: String = ""
    // Trusted JWT — the WS upgrade is authenticated by the server using this token,
    // and the authenticated user_id is what the server uses when saving the lesson.
    private var accessToken: String? = null

    fun setLessonContext(group: String, topic: String, course: String = "", token: String? = null) {
        groupName = group
        topicName = topic
        courseType = course
        accessToken = token
    }

    fun connectWebSocket(retryCount: Int = 0) {
        // Send the access token as ?token= on the upgrade URL so the server can
        // authenticate the connection and know which user to save the lesson under.
        val baseWs = ServerConfig.wsUrl
        val tk = accessToken
        val wsUrl = if (!tk.isNullOrBlank()) {
            val sep = if (baseWs.contains("?")) "&" else "?"
            "$baseWs${sep}token=${java.net.URLEncoder.encode(tk, "UTF-8")}"
        } else baseWs
        Log.d(TAG, "Connecting to WS (attempt ${retryCount + 1})")
        _connectionState.value = if (retryCount > 0) "Qayta ulanmoqda... (${retryCount}/$MAX_RECONNECT_ATTEMPTS)" else "Ulanmoqda..."
        reconnectAttempt = retryCount

        val requestBuilder = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", "Eyeziyo-Android/1.0")
        if (!tk.isNullOrBlank()) {
            requestBuilder.header("Authorization", "Bearer $tk")
        }
        val request = requestBuilder.build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected!")
                wsConnected = true
                reconnectAttempt = 0
                _connectionState.value = "Ulangan ✓"

                val config = JSONObject().apply {
                    put("type", "config")
                    put("group", groupName)
                    put("topic", topicName)
                    put("course_type", courseType)
                }
                webSocket.send(config.toString())
                Log.d(TAG, "Config sent: $config")

                // Send any pending chunks that were queued during reconnect
                synchronized(pendingChunks) {
                    if (pendingChunks.isNotEmpty()) {
                        Log.d(TAG, "Sending ${pendingChunks.size} pending chunks")
                        val chunks = pendingChunks.toList()
                        pendingChunks.clear()
                        chunks.forEach { chunk ->
                            webSocket.send(chunk.toByteString())
                        }
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    when (json.getString("type")) {
                        "config_ack" -> {
                            Log.d(TAG, "Config acknowledged by server")
                        }

                        "processing" -> {
                            _currentStage.value = "processing"
                        }

                        "transcript" -> {
                            val stage = json.optString("stage", "")
                            when (stage) {
                                "raw" -> {
                                    // Phase 1: raw STT result — show immediately
                                    chunksProcessed.incrementAndGet()
                                    Log.d(TAG, "Chunk processed: ${chunksProcessed.get()}/${chunksSent.get()}")
                                    val rawText = json.optString("raw_text", "")
                                    if (rawText.isNotEmpty()) {
                                        _rawTranscript.value = rawText
                                    }
                                    val full = json.optString("full", "")
                                    _transcript.value = full
                                    _currentStage.value = "raw"
                                    Log.d(TAG, "Phase1 raw: ${full.takeLast(60)}")
                                }
                                "corrected" -> {
                                    // Phase 2: Gemini corrected — update text
                                    val full = json.optString("full", "")
                                    _transcript.value = full
                                    _correctionConfidence.value = json.optDouble("correction_confidence", 0.0).toFloat()
                                    _currentStage.value = "corrected"
                                    Log.d(TAG, "Phase2 corrected: ${full.takeLast(60)}")
                                }
                                "skipped" -> {
                                    // Empty chunk — still count it as processed
                                    chunksProcessed.incrementAndGet()
                                    Log.d(TAG, "Chunk skipped: ${chunksProcessed.get()}/${chunksSent.get()}")
                                }
                                else -> {
                                    val full = json.optString("full", "")
                                    if (full.isNotEmpty()) _transcript.value = full
                                }
                            }

                            // Update engagement stats (present in raw stage)
                            if (json.has("engagement_score")) {
                                _engagementScore.value = json.getInt("engagement_score")
                                _teacherRatio.value = json.optInt("teacher_ratio", 0)
                                _studentRatio.value = json.optInt("student_ratio", 0)
                            }
                        }

                        "evaluating" -> {
                            _isEvaluating.value = true
                            _currentStage.value = "evaluating"
                        }

                        "evaluation" -> {
                            // Server includes the canonical full_transcript in the
                            // evaluation message — this is what the AI actually
                            // analysed. Replace the local transcript with it so the
                            // user sees exactly what was evaluated, and so the
                            // saved lesson record is complete.
                            val serverFull = json.optString("full_transcript", "")
                            if (serverFull.isNotEmpty()) {
                                _transcript.value = serverFull
                            }
                            _evaluation.value = LessonEvaluation(
                                overallScore = json.optInt("overall_score", 0),
                                clarityScore = json.optInt("clarity_score", 0),
                                engagementScore = json.optInt("engagement_score", 0),
                                contentScore = json.optInt("content_score", 0),
                                summary = json.optString("summary", ""),
                                strengths = jsonArrayToList(json.optJSONArray("strengths")),
                                improvements = jsonArrayToList(json.optJSONArray("improvements")),
                                advice = jsonArrayToList(json.optJSONArray("advice"))
                            )
                            _isEvaluating.value = false
                            _currentStage.value = "evaluated"
                            Log.d(TAG, "Evaluation received: score=${_evaluation.value?.overallScore}, transcript_len=${serverFull.length}")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing WS message: $text", e)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                wsConnected = false
                _connectionState.value = "Uzilgan"
                Log.d(TAG, "WebSocket closed: $reason")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                wsConnected = false
                Log.e(TAG, "WebSocket fail: ${t.message}", t)

                // Reconnect with exponential backoff if still recording
                if (!stopRequested.get() && _isRecording.value && retryCount < MAX_RECONNECT_ATTEMPTS) {
                    val delayMs = (1000L * (1 shl retryCount)).coerceAtMost(30000L)
                    Log.d(TAG, "Reconnecting in ${delayMs}ms (attempt ${retryCount + 1}/$MAX_RECONNECT_ATTEMPTS)")
                    _connectionState.value = "Qayta ulanmoqda... (${retryCount + 1}/$MAX_RECONNECT_ATTEMPTS)"

                    viewModelScope.launch {
                        delay(delayMs)
                        if (!stopRequested.get() && _isRecording.value) {
                            connectWebSocket(retryCount + 1)
                        }
                    }
                } else if (retryCount >= MAX_RECONNECT_ATTEMPTS) {
                    _connectionState.value = "Ulanib bo'lmadi ✗"
                    Log.e(TAG, "Max reconnect attempts reached")
                } else {
                    _connectionState.value = "Xatolik: ${t.message}"
                }
            }
        })
    }

    private fun jsonArrayToList(array: JSONArray?): List<String> {
        if (array == null) return emptyList()
        return (0 until array.length()).map { array.getString(it) }
    }

    /**
     * Send audio data via WebSocket with queue fallback.
     * If WS is disconnected, data is queued for retry after reconnect.
     */
    private fun sendAudioData(wavBytes: ByteArray) {
        val ws = webSocket
        if (ws != null && wsConnected) {
            ws.send(wavBytes.toByteString())
        } else {
            // Queue for sending after reconnect
            Log.w(TAG, "WebSocket not connected, queuing chunk (${wavBytes.size / 1024}KB)")
            pendingChunks.add(wavBytes)
        }
    }

    @SuppressLint("MissingPermission")
    fun startRecording() {
        if (_isRecording.value) return
        stopRequested.set(false)
        pendingChunks.clear()
        connectWebSocket()

        val bufferSize = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        Log.d(TAG, "AudioRecord minBufferSize=$bufferSize")

        // Use MIC source — VOICE_RECOGNITION applies aggressive noise suppression
        // and AGC which mutes soft classroom speech and dynamically changes gain
        // mid-sentence. MIC gives us the raw signal so Gemini STT can handle it.
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize * 4  // larger internal buffer to prevent overflows
        )

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord failed to initialize! state=${audioRecord?.state}")
            _connectionState.value = "Mikrofon xatosi"
            return
        }

        audioRecord?.startRecording()
        _isRecording.value = true
        _isPaused.value = false
        _elapsedSeconds.value = 0
        _evaluation.value = null
        _currentStage.value = "idle"
        _transcript.value = ""

        startTimer()

        // ALL audio reading, buffering, and flushing happens on this single IO thread
        // No thread-safety issues since audioBuffer is only touched here
        recordingJob = viewModelScope.launch(Dispatchers.IO) {
            val readBuffer = ShortArray(bufferSize)
            val audioBuffer = ArrayList<Short>(sampleRate * 13) // pre-allocate for ~13 seconds
            var readCount = 0
            var totalSamplesSent = 0

            // FIXED-INTERVAL CHUNKING (no pause detection)
            // We send every CHUNK_SECONDS regardless of speech content. Pause
            // based chunking was cutting words mid-sentence, so we drop it
            // entirely and accept that some chunks may start/end mid-word.
            // To reduce mid-word cuts we keep the last OVERLAP_SECONDS of audio
            // in the buffer so it's re-sent at the start of the next chunk.
            // The server-side session dedup + prev-tail context on Gemini
            // handle the repeated overlap.
            val CHUNK_SECONDS = 12
            val CHUNK_SAMPLES = sampleRate * CHUNK_SECONDS
            val OVERLAP_SAMPLES = sampleRate / 2  // 0.5s

            Log.d(TAG, "=== Recording loop STARTED (fixed ${CHUNK_SECONDS}s chunks) ===")

            // Main recording loop — runs until stopRequested is set
            while (!stopRequested.get()) {
                if (_isPaused.value) {
                    delay(100)
                    continue
                }

                val recorder = audioRecord ?: break
                val read = recorder.read(readBuffer, 0, readBuffer.size)

                if (read > 0) {
                    // Add samples to local buffer
                    for (i in 0 until read) {
                        audioBuffer.add(readBuffer[i])
                    }

                    readCount++
                    if (readCount % 30 == 0) {
                        // Periodic energy log for debugging
                        var energySum = 0.0
                        for (i in 0 until read) energySum += Math.abs(readBuffer[i].toInt())
                        val bufSec = audioBuffer.size.toFloat() / sampleRate
                        Log.d(TAG, "Audio: energy=${"%.0f".format(energySum / read)}, buf=${"%.1f".format(bufSec)}s")
                    }

                    // Flush as soon as we have CHUNK_SECONDS of audio, regardless
                    // of whether the speaker is talking or pausing. Keep the
                    // tail (OVERLAP_SAMPLES) in the buffer so the next chunk
                    // starts with that audio — dedup on the server removes
                    // the repeated content.
                    if (audioBuffer.size >= CHUNK_SAMPLES) {
                        val samples = audioBuffer.toShortArray()
                        val overlap = ArrayList<Short>(OVERLAP_SAMPLES)
                        val overlapStart = (audioBuffer.size - OVERLAP_SAMPLES).coerceAtLeast(0)
                        for (i in overlapStart until audioBuffer.size) overlap.add(audioBuffer[i])
                        audioBuffer.clear()
                        audioBuffer.addAll(overlap)

                        val durSec = samples.size.toFloat() / sampleRate
                        totalSamplesSent += samples.size
                        chunksSent.incrementAndGet()
                        Log.d(TAG, ">>> SENDING chunk #${chunksSent.get()}: ${"%.1f".format(durSec)}s, ${samples.size * 2 / 1024}KB (total sent: ${totalSamplesSent / sampleRate}s)")

                        val wavBytes = buildWav(samples, sampleRate)
                        sendAudioData(wavBytes)
                    }
                } else if (read < 0) {
                    Log.e(TAG, "AudioRecord.read error: $read")
                    break
                }
            }

            // Loop ended — send remaining audio
            Log.d(TAG, "=== Recording loop ENDED, remaining: ${audioBuffer.size} samples ===")

            if (audioBuffer.isNotEmpty() && webSocket != null) {
                val samples = audioBuffer.toShortArray()
                audioBuffer.clear()
                val durSec = samples.size.toFloat() / sampleRate

                // Check energy — skip silent final chunks to prevent
                // Gemini hallucination (it fabricates realistic text on silence)
                var energySum = 0.0
                for (s in samples) energySum += Math.abs(s.toInt())
                val avgEnergy = if (samples.isNotEmpty()) energySum / samples.size else 0.0

                if (avgEnergy > 150) {
                    // Real speech detected — send it (even if short, e.g. "Tamom")
                    totalSamplesSent += samples.size
                    chunksSent.incrementAndGet()
                    Log.d(TAG, ">>> SENDING final chunk #${chunksSent.get()}: ${"%.1f".format(durSec)}s energy=${"%.0f".format(avgEnergy)}")
                    val wavBytes = buildWav(samples, sampleRate)
                    sendAudioData(wavBytes)
                } else {
                    Log.d(TAG, "Final chunk skipped (dur=${"%.1f".format(durSec)}s energy=${"%.0f".format(avgEnergy)}) — silent")
                }
            }

            Log.d(TAG, "Total audio sent: ${totalSamplesSent / sampleRate}s")

            // Release mic on this same thread
            try {
                audioRecord?.stop()
                audioRecord?.release()
                Log.d(TAG, "AudioRecord released")
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing AudioRecord", e)
            }
            audioRecord = null
            _isRecording.value = false
        }
    }

    fun pauseRecording() {
        _isPaused.value = true
        // Note: AudioRecord keeps running but audio is discarded in the recording loop.
        // This avoids threading issues with stop()/startRecording() called from different threads.
    }

    fun resumeRecording() {
        _isPaused.value = false
    }

    fun stopRecording() {
        Log.d(TAG, "stopRecording() called")
        timerJob?.cancel()

        // Signal the recording loop to stop — it will flush remaining audio and release mic
        stopRequested.set(true)
    }

    fun requestEvaluation() {
        Log.d(TAG, "Requesting evaluation... (sent=${chunksSent.get()}, processed=${chunksProcessed.get()})")
        _isEvaluating.value = true
        _currentStage.value = "evaluating"

        // Wait until ALL sent chunks are processed before requesting evaluation
        viewModelScope.launch(Dispatchers.IO) {
            val maxWaitMs = 30_000L  // Maximum 30 seconds wait
            val startTime = System.currentTimeMillis()

            while (chunksProcessed.get() < chunksSent.get()) {
                val elapsed = System.currentTimeMillis() - startTime
                if (elapsed > maxWaitMs) {
                    Log.w(TAG, "Timeout waiting for chunks: ${chunksProcessed.get()}/${chunksSent.get()} processed")
                    break
                }
                Log.d(TAG, "Waiting for chunks: ${chunksProcessed.get()}/${chunksSent.get()} (${elapsed/1000}s)")
                delay(500)
            }

            Log.d(TAG, "All chunks processed (${chunksProcessed.get()}/${chunksSent.get()}), sending finish")
            val finishMsg = JSONObject().apply {
                put("type", "finish")
                put("duration_seconds", _elapsedSeconds.value)
            }
            webSocket?.send(finishMsg.toString())
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            delay(1000)
            webSocket?.close(1000, "Done")
            wsConnected = false
            Log.d(TAG, "WebSocket closed")
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                if (!_isPaused.value) {
                    _elapsedSeconds.value++
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopRequested.set(true)

        // Cancel coroutines first — they handle audioRecord release
        recordingJob?.cancel()
        timerJob?.cancel()

        // Only release audioRecord if the recording coroutine isn't running
        if (recordingJob?.isActive != true) {
            try {
                audioRecord?.stop()
                audioRecord?.release()
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing AudioRecord in onCleared", e)
            }
            audioRecord = null
        }

        webSocket?.cancel()
        wsConnected = false
        client.dispatcher.executorService.shutdown()
    }

    /**
     * Build a WAV file from raw PCM 16-bit mono samples.
     */
    private fun buildWav(samples: ShortArray, sampleRate: Int): ByteArray {
        val byteLength = samples.size * 2
        val headerSize = 44
        val buffer = ByteBuffer.allocate(headerSize + byteLength)
        buffer.order(ByteOrder.LITTLE_ENDIAN)

        buffer.put("RIFF".toByteArray())
        buffer.putInt(36 + byteLength)
        buffer.put("WAVE".toByteArray())

        buffer.put("fmt ".toByteArray())
        buffer.putInt(16)
        buffer.putShort(1)  // PCM
        buffer.putShort(1)  // mono
        buffer.putInt(sampleRate)
        buffer.putInt(sampleRate * 2)
        buffer.putShort(2)  // block align
        buffer.putShort(16) // bits per sample

        buffer.put("data".toByteArray())
        buffer.putInt(byteLength)

        for (sample in samples) {
            buffer.putShort(sample)
        }

        return buffer.array()
    }
}
