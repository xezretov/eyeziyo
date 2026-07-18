package com.eyeziyo.mentor.util

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Thin wrapper around the platform's SpeechRecognizer.
 * Lifecycle is owned by the caller — call `stop()` from the dispose path of
 * the Composable that started us so we release the system mic.
 */
class VoiceInput(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    private var listenerImpl: RecognitionListener? = null

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED

    fun requestPermission(activity: Activity, requestCode: Int = 1042) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.RECORD_AUDIO), requestCode)
    }

    /**
     * Listens once. `onPartial` fires repeatedly as speech is recognized,
     * `onFinal` fires once with the best result, `onError` for the rest.
     */
    fun listen(
        languageTag: String = "uz-UZ",
        onPartial: (String) -> Unit = {},
        onFinal: (String) -> Unit,
        onError: (String) -> Unit = {},
    ) {
        if (!isAvailable()) {
            onError("unavailable"); return
        }
        stop()
        val rec = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = rec
        listenerImpl = object : RecognitionListener {
            override fun onReadyForSpeech(p0: android.os.Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(p0: Float) {}
            override fun onBufferReceived(p0: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(err: Int) {
                onError("err_$err")
                stop()
            }
            override fun onResults(results: android.os.Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) onFinal(text) else onError("empty")
                stop()
            }
            override fun onPartialResults(partial: android.os.Bundle?) {
                val text = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) onPartial(text)
            }
            override fun onEvent(p0: Int, p1: android.os.Bundle?) {}
        }
        rec.setRecognitionListener(listenerImpl)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        rec.startListening(intent)
    }

    fun stop() {
        try {
            recognizer?.stopListening()
            recognizer?.destroy()
        } catch (_: Exception) {}
        recognizer = null
        listenerImpl = null
    }
}
