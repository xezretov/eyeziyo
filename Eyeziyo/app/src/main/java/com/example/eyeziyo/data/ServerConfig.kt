package com.example.eyeziyo.data

import android.content.Context

/**
 * Server configuration — Cloudflare Workers production.
 */
object ServerConfig {
    private const val API_DOMAIN = "api.eyeziyo.uz"

    fun initialize(context: Context) {
        // Nothing to initialize — config is hardcoded
    }

    /** WebSocket URL for real-time transcription. */
    val wsUrl: String
        get() = "wss://$API_DOMAIN/ws/transcribe"

    /** HTTPS URL for REST API. */
    val httpUrl: String
        get() = "https://$API_DOMAIN"
}
