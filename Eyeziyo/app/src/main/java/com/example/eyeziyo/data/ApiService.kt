package com.example.eyeziyo.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * API Response models
 */
@Serializable
data class TokenResponse(
    val access_token: String,
    val refresh_token: String,
    val token_type: String = "bearer",
    val expires_in: Int
)

@Serializable
data class ApiUser(
    val id: Int,
    val email: String,
    val name: String,
    val role: String,
    val avatar: String,
    val groups: List<String>,
    val course_type: String
)

@Serializable
data class ApiLesson(
    val id: Int,
    val user_id: Int,
    val group_name: String,
    val topic: String,
    val course_type: String,
    val duration_seconds: Int,
    val transcript: String,
    val created_at: String,
    val evaluation: ApiEvaluation? = null
)

@Serializable
data class ApiEvaluation(
    val id: Int,
    val lesson_id: Int,
    val overall_score: Int,
    val topic_score: Int = 0,
    val speech_score: Int = 0,
    val method_score: Int = 0,
    val interaction_score: Int = 0,
    val feedback_score: Int = 0,
    val summary: String,
    val strengths: List<String>,
    val improvements: List<String>,
    val advice: List<String>
)

@Serializable
data class TeacherStats(
    val user_id: Int,
    val name: String,
    val email: String,
    val avatar: String,
    val course_type: String,
    val groups: List<String>,
    val total_lessons: Int,
    val total_duration_minutes: Int,
    val average_score: Int,
    val last_lesson_date: String?
)

@Serializable
data class TeacherGroupStat(
    val group_name: String,
    val course_type: String,
    val total_lessons: Int,
    val total_duration_minutes: Int,
    val average_score: Int,
    val last_lesson_date: String? = null
)

@Serializable
data class TeacherLessonBrief(
    val id: Int,
    val group_name: String,
    val topic: String,
    val course_type: String,
    val duration_seconds: Int,
    val created_at: String,
    val score: Int
)

@Serializable
data class TeacherDetail(
    val user_id: Int,
    val name: String,
    val email: String,
    val avatar: String,
    val course_type: String,
    val groups: List<String>,
    val total_lessons: Int,
    val average_score: Int,
    val group_stats: List<TeacherGroupStat>,
    val lessons: List<TeacherLessonBrief>
)

@Serializable
data class SchoolStats(
    val total_teachers: Int,
    val total_lessons: Int,
    val total_duration_hours: Int,
    val average_engagement_score: Int,
    val lessons_today: Int
)

@Serializable
data class ApiError(
    val detail: String
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    val name: String,
    val role: String = "teacher",
    val groups: List<String> = emptyList(),
    val course_type: String = ""
)

@Serializable
data class CreateLessonRequest(
    val group_name: String,
    val topic: String,
    val course_type: String = ""
)

@Serializable
data class UpdateLessonRequest(
    val transcript: String? = null,
    val duration_seconds: Int? = null
)

@Serializable
data class SaveEvaluationRequest(
    val overall_score: Int,
    val topic_score: Int,
    val speech_score: Int,
    val method_score: Int,
    val interaction_score: Int,
    val feedback_score: Int,
    val summary: String,
    val strengths: List<String>,
    val improvements: List<String>,
    val advice: List<String>
)

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val message: String, val code: Int = 0) : ApiResult<Nothing>()
}

/**
 * API Service for Eyeziyo backend communication
 */
class ApiService private constructor(context: Context) {

    private val prefs: SharedPreferences = createSecurePrefs(context)

    init {
        // One-shot migration: copy any tokens still sitting in the legacy
        // plaintext prefs file into the encrypted store, then erase the legacy.
        migrateLegacyPrefsIfNeeded(context, prefs)
    }

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            val token = accessToken

            val builder = original.newBuilder()
                .header("User-Agent", "Eyeziyo-Android/1.0")

            if (token != null && !original.url.encodedPath.contains("/auth/")) {
                builder.header("Authorization", "Bearer $token")
            }

            chain.proceed(builder.build())
        }
        .build()

    companion object {
        private const val TAG = "ApiService"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_JSON = "user_json"
        private const val LEGACY_PREFS_NAME = "eyeziyo_auth"
        private const val SECURE_PREFS_NAME = "eyeziyo_auth_secure"

        @Volatile
        private var instance: ApiService? = null

        fun getInstance(context: Context): ApiService {
            return instance ?: synchronized(this) {
                instance ?: ApiService(context.applicationContext).also { instance = it }
            }
        }

        /** Build an EncryptedSharedPreferences-backed prefs file. Falls back to
         *  plaintext prefs only if the security-crypto library throws on this
         *  device (rare — older Android Keystore corruption). */
        private fun createSecurePrefs(context: Context): SharedPreferences {
            return try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    SECURE_PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e: Exception) {
                Log.e(TAG, "EncryptedSharedPreferences unavailable, falling back to plaintext", e)
                context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            }
        }

        private fun migrateLegacyPrefsIfNeeded(context: Context, secure: SharedPreferences) {
            val legacy = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            if (legacy.all.isEmpty()) return
            val editor = secure.edit()
            legacy.getString(KEY_ACCESS_TOKEN, null)?.let { editor.putString(KEY_ACCESS_TOKEN, it) }
            legacy.getString(KEY_REFRESH_TOKEN, null)?.let { editor.putString(KEY_REFRESH_TOKEN, it) }
            legacy.getString(KEY_USER_JSON, null)?.let { editor.putString(KEY_USER_JSON, it) }
            editor.apply()
            legacy.edit().clear().apply()
            Log.i(TAG, "Migrated auth prefs from plaintext → encrypted store")
        }
    }

    private val baseUrl: String
        get() = ServerConfig.httpUrl

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS_TOKEN, null)
        private set(value) {
            prefs.edit().putString(KEY_ACCESS_TOKEN, value).apply()
        }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        private set(value) {
            prefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()
        }

    var cachedUser: ApiUser?
        get() {
            val userJson = prefs.getString(KEY_USER_JSON, null) ?: return null
            return try {
                json.decodeFromString<ApiUser>(userJson)
            } catch (e: Exception) {
                null
            }
        }
        private set(value) {
            if (value != null) {
                prefs.edit().putString(KEY_USER_JSON, json.encodeToString(value)).apply()
            } else {
                prefs.edit().remove(KEY_USER_JSON).apply()
            }
        }

    val isLoggedIn: Boolean
        get() = accessToken != null

    /**
     * Clear all authentication data
     */
    fun logout() {
        accessToken = null
        refreshToken = null
        cachedUser = null
    }

    /**
     * Login and get JWT tokens
     */
    suspend fun login(email: String, password: String): ApiResult<ApiUser> {
        return withContext(Dispatchers.IO) {
            try {
                val request = LoginRequest(email, password)
                val body = json.encodeToString(request)
                    .toRequestBody("application/json".toMediaType())

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/auth/login")
                    .post(body)
                    .build()

                val response = client.newCall(httpRequest).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val tokens = json.decodeFromString<TokenResponse>(responseBody)
                    accessToken = tokens.access_token
                    refreshToken = tokens.refresh_token

                    // Fetch user profile
                    when (val userResult = getCurrentUser()) {
                        is ApiResult.Success -> {
                            cachedUser = userResult.data
                            ApiResult.Success(userResult.data)
                        }
                        is ApiResult.Error -> userResult
                    }
                } else {
                    val error = try {
                        json.decodeFromString<ApiError>(responseBody)
                    } catch (e: Exception) {
                        ApiError("Noma'lum xatolik")
                    }
                    ApiResult.Error(error.detail, response.code)
                }
            } catch (e: IOException) {
                ApiResult.Error("Serverga ulanib bo'lmadi: ${e.message}")
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Register new user
     */
    suspend fun register(
        email: String,
        password: String,
        name: String,
        role: String = "teacher",
        groups: List<String> = emptyList(),
        courseType: String = ""
    ): ApiResult<ApiUser> {
        return withContext(Dispatchers.IO) {
            try {
                val request = RegisterRequest(email, password, name, role, groups, courseType)
                val body = json.encodeToString(request)
                    .toRequestBody("application/json".toMediaType())

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/auth/register")
                    .post(body)
                    .build()

                val response = client.newCall(httpRequest).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val user = json.decodeFromString<ApiUser>(responseBody)
                    ApiResult.Success(user)
                } else {
                    val error = try {
                        json.decodeFromString<ApiError>(responseBody)
                    } catch (e: Exception) {
                        ApiError("Ro'yxatdan o'tishda xatolik")
                    }
                    ApiResult.Error(error.detail, response.code)
                }
            } catch (e: IOException) {
                ApiResult.Error("Serverga ulanib bo'lmadi")
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Get current user profile
     */
    suspend fun getCurrentUser(): ApiResult<ApiUser> {
        return withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/users/me")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val user = json.decodeFromString<ApiUser>(responseBody)
                    cachedUser = user
                    ApiResult.Success(user)
                } else if (response.code == 401) {
                    // Try to refresh token
                    when (val refreshResult = refreshAccessToken()) {
                        is ApiResult.Success -> getCurrentUser()
                        is ApiResult.Error -> {
                            logout()
                            refreshResult
                        }
                    }
                } else {
                    ApiResult.Error("Foydalanuvchi ma'lumotlarini olishda xatolik", response.code)
                }
            } catch (e: IOException) {
                ApiResult.Error("Serverga ulanib bo'lmadi")
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Refresh access token
     */
    private suspend fun refreshAccessToken(): ApiResult<Unit> {
        val refresh = refreshToken ?: return ApiResult.Error("Refresh token mavjud emas")

        return withContext(Dispatchers.IO) {
            try {
                val body = """{"refresh_token": "$refresh"}"""
                    .toRequestBody("application/json".toMediaType())

                val request = Request.Builder()
                    .url("$baseUrl/api/auth/refresh")
                    .post(body)
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val tokens = json.decodeFromString<TokenResponse>(responseBody)
                    accessToken = tokens.access_token
                    refreshToken = tokens.refresh_token
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Error("Token yangilanmadi", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Token yangilashda xatolik: ${e.message}")
            }
        }
    }

    /**
     * Get all lessons for current user
     */
    suspend fun getLessons(limit: Int = 50): ApiResult<List<ApiLesson>> {
        return withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/lessons?limit=$limit")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val lessons = json.decodeFromString<List<ApiLesson>>(responseBody)
                    ApiResult.Success(lessons)
                } else if (response.code == 401) {
                    when (val refreshResult = refreshAccessToken()) {
                        is ApiResult.Success -> getLessons(limit)
                        is ApiResult.Error -> refreshResult
                    }
                } else {
                    ApiResult.Error("Darslarni olishda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Create a new lesson
     */
    suspend fun createLesson(
        groupName: String,
        topic: String,
        courseType: String = ""
    ): ApiResult<ApiLesson> {
        return withContext(Dispatchers.IO) {
            try {
                val request = CreateLessonRequest(groupName, topic, courseType)
                val body = json.encodeToString(request)
                    .toRequestBody("application/json".toMediaType())

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/lessons")
                    .post(body)
                    .build()

                val response = client.newCall(httpRequest).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val lesson = json.decodeFromString<ApiLesson>(responseBody)
                    ApiResult.Success(lesson)
                } else {
                    ApiResult.Error("Dars yaratishda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Update lesson
     */
    suspend fun updateLesson(
        lessonId: Int,
        transcript: String? = null,
        durationSeconds: Int? = null
    ): ApiResult<ApiLesson> {
        return withContext(Dispatchers.IO) {
            try {
                val request = UpdateLessonRequest(transcript, durationSeconds)
                val body = json.encodeToString(request)
                    .toRequestBody("application/json".toMediaType())

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/lessons/$lessonId")
                    .put(body)
                    .build()

                val response = client.newCall(httpRequest).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val lesson = json.decodeFromString<ApiLesson>(responseBody)
                    ApiResult.Success(lesson)
                } else {
                    ApiResult.Error("Darsni yangilashda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Save evaluation for a lesson
     */
    suspend fun saveEvaluation(
        lessonId: Int,
        overallScore: Int,
        topicScore: Int,
        speechScore: Int,
        methodScore: Int,
        interactionScore: Int,
        feedbackScore: Int,
        summary: String,
        strengths: List<String>,
        improvements: List<String>,
        advice: List<String>
    ): ApiResult<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val request = SaveEvaluationRequest(
                    overallScore, topicScore, speechScore, methodScore, interactionScore, feedbackScore,
                    summary, strengths, improvements, advice
                )
                val body = json.encodeToString(request)
                    .toRequestBody("application/json".toMediaType())

                val httpRequest = Request.Builder()
                    .url("$baseUrl/api/lessons/$lessonId/evaluation")
                    .post(body)
                    .build()

                val response = client.newCall(httpRequest).execute()

                if (response.isSuccessful) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Error("Baholashni saqlashda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Get all teachers (admin only)
     */
    suspend fun getTeachers(): ApiResult<List<TeacherStats>> {
        return withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/admin/teachers")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val teachers = json.decodeFromString<List<TeacherStats>>(responseBody)
                    ApiResult.Success(teachers)
                } else if (response.code == 403) {
                    ApiResult.Error("Admin huquqi kerak", response.code)
                } else {
                    ApiResult.Error("O'qituvchilarni olishda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Replace a teacher's group list (admin only)
     */
    suspend fun updateTeacherGroups(teacherId: Int, groups: List<String>): ApiResult<List<String>> {
        return withContext(Dispatchers.IO) {
            try {
                val body = buildString {
                    append("{\"groups\":[")
                    groups.forEachIndexed { i, g ->
                        if (i > 0) append(",")
                        append("\"")
                        append(g.replace("\\", "\\\\").replace("\"", "\\\""))
                        append("\"")
                    }
                    append("]}")
                }
                val request = Request.Builder()
                    .url("$baseUrl/api/admin/teachers/$teacherId/groups")
                    .put(body.toRequestBody("application/json".toMediaType()))
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val parsed = json.parseToJsonElement(responseBody).jsonObject
                    val groupsArray = parsed["groups"]?.jsonArray?.map { it.jsonPrimitive.content } ?: groups
                    ApiResult.Success(groupsArray)
                } else if (response.code == 403) {
                    ApiResult.Error("Admin huquqi kerak", response.code)
                } else if (response.code == 404) {
                    ApiResult.Error("O'qituvchi topilmadi", response.code)
                } else {
                    ApiResult.Error("Guruhlarni yangilashda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Get full detail for a single teacher (admin only)
     */
    suspend fun getTeacherDetail(teacherId: Int): ApiResult<TeacherDetail> {
        return withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/admin/teachers/$teacherId/detail")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val detail = json.decodeFromString<TeacherDetail>(responseBody)
                    ApiResult.Success(detail)
                } else if (response.code == 404) {
                    ApiResult.Error("O'qituvchi topilmadi", response.code)
                } else if (response.code == 403) {
                    ApiResult.Error("Admin huquqi kerak", response.code)
                } else {
                    ApiResult.Error("O'qituvchi ma'lumotlarini olishda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }

    /**
     * Get school statistics (admin only)
     */
    suspend fun getSchoolStats(): ApiResult<SchoolStats> {
        return withContext(Dispatchers.IO) {
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/admin/stats")
                    .get()
                    .build()

                val response = client.newCall(request).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    val stats = json.decodeFromString<SchoolStats>(responseBody)
                    ApiResult.Success(stats)
                } else {
                    ApiResult.Error("Statistikani olishda xatolik", response.code)
                }
            } catch (e: Exception) {
                ApiResult.Error("Xatolik: ${e.message}")
            }
        }
    }
}
