package com.eyeziyo.mentor.data.net

import com.eyeziyo.mentor.BuildConfig
import com.eyeziyo.mentor.data.prefs.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Single OkHttp + serialization stack for the whole app.
 *
 * Auth flow:
 * - AuthInterceptor stamps every request with the current access token.
 * - On a 401 we serialize through `refreshLock` so concurrent requests don't
 *   each try to refresh. The refresh is best-effort: if it fails we surface
 *   the original 401 and let the UI bounce to login.
 */
object ApiClient {
    const val BASE_URL = "https://api.eyeziyo.uz"

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = false
    }

    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val refreshLock = Mutex()

    private val authInterceptor = Interceptor { chain ->
        val original = chain.request()
        val token = SessionManager.accessToken()
        val req = if (token != null) {
            original.newBuilder().header("Authorization", "Bearer $token").build()
        } else original
        var resp = chain.proceed(req)

        if (resp.code == 401 && SessionManager.refreshToken() != null && !req.url.encodedPath.contains("/auth/")) {
            resp.close()
            val newToken = runBlocking(Dispatchers.IO) { tryRefresh() }
            resp = if (newToken != null) {
                val retried = original.newBuilder().header("Authorization", "Bearer $newToken").build()
                chain.proceed(retried)
            } else {
                chain.proceed(req)
            }
        }
        resp
    }

    private suspend fun tryRefresh(): String? = refreshLock.withLock {
        val current = SessionManager.refreshToken() ?: return@withLock null
        val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(current))
        val rb: RequestBody = body.toRequestBody(JSON_MEDIA)
        val req = Request.Builder().url("$BASE_URL/api/auth/refresh").post(rb).build()
        runCatching {
            rawClient.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@use null
                val text = r.body?.string().orEmpty()
                val parsed = json.decodeFromString(TokenResponse.serializer(), text)
                SessionManager.setTokens(parsed.access_token, parsed.refresh_token.ifBlank { current })
                parsed.access_token
            }
        }.getOrNull()
    }

    private val rawClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                })
            }
        }
        .build()

    suspend fun <T> execute(
        path: String,
        method: String,
        body: String?,
        deserializer: kotlinx.serialization.DeserializationStrategy<T>,
    ): T = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(BASE_URL + path)
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> builder.delete(body?.toRequestBody(JSON_MEDIA))
            "PUT" -> builder.put((body ?: "{}").toRequestBody(JSON_MEDIA))
            else -> builder.post((body ?: "{}").toRequestBody(JSON_MEDIA))
        }
        http.newCall(builder.build()).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val detail = parseDetail(text)
                throw ApiException(resp.code, detail)
            }
            if (text.isEmpty()) {
                @Suppress("UNCHECKED_CAST")
                Unit as T
            } else {
                json.decodeFromString(deserializer, text)
            }
        }
    }

    private fun parseDetail(text: String): String? = runCatching {
        val body = json.decodeFromString(ApiErrorBody.serializer(), text)
        body.detail ?: body.message
    }.getOrNull()
}
