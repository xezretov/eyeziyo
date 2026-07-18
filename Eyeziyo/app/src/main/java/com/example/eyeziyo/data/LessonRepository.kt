package com.example.eyeziyo.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.*

/**
 * Lesson data model for storage
 */
@Serializable
data class StoredLesson(
    val id: String = UUID.randomUUID().toString(),
    val groupName: String,
    val topicName: String,
    val courseType: String,
    val dateTimestamp: Long = System.currentTimeMillis(),
    val durationSeconds: Int = 0,
    val transcript: String = "",
    val status: String = "completed", // "completed", "processing", "error"
    // Evaluation results
    val overallScore: Int = 0,
    val clarityScore: Int = 0,
    val engagementScore: Int = 0,
    val contentScore: Int = 0,
    val summary: String = "",
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    val advice: List<String> = emptyList(),
    // Stats
    val teacherRatio: Int = 0,
    val studentRatio: Int = 0,
    val questionsAsked: Int = 0
) {
    val formattedDate: String
        get() {
            val now = System.currentTimeMillis()
            val diff = now - dateTimestamp
            val days = diff / (1000 * 60 * 60 * 24)

            return when {
                days == 0L -> {
                    val sdf = SimpleDateFormat("HH:mm", Locale("uz"))
                    "Bugun, ${sdf.format(Date(dateTimestamp))}"
                }
                days == 1L -> "Kecha"
                days < 7 -> "$days kun oldin"
                else -> {
                    val sdf = SimpleDateFormat("d MMM", Locale("uz"))
                    sdf.format(Date(dateTimestamp))
                }
            }
        }

    val formattedDuration: String?
        get() = if (durationSeconds > 0) {
            val minutes = durationSeconds / 60
            "$minutes daq"
        } else null
}

/**
 * Repository for managing lesson data persistence
 */
class LessonRepository(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(
        "eyeziyo_lessons", Context.MODE_PRIVATE
    )

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    companion object {
        private const val KEY_LESSONS = "lessons_list"
        private const val KEY_LAST_STATS = "last_stats"

        @Volatile
        private var instance: LessonRepository? = null

        fun getInstance(context: Context): LessonRepository {
            return instance ?: synchronized(this) {
                instance ?: LessonRepository(context.applicationContext).also { instance = it }
            }
        }
    }

    /**
     * Get all stored lessons
     */
    fun getAllLessons(): List<StoredLesson> {
        val jsonStr = prefs.getString(KEY_LESSONS, null) ?: return emptyList()
        return try {
            json.decodeFromString<List<StoredLesson>>(jsonStr)
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Get lesson by ID
     */
    fun getLessonById(id: String): StoredLesson? {
        return getAllLessons().find { it.id == id }
    }

    /**
     * Get the most recent lesson
     */
    fun getLastLesson(): StoredLesson? {
        return getAllLessons().maxByOrNull { it.dateTimestamp }
    }

    /**
     * Get lessons for today
     */
    fun getTodayLessons(): List<StoredLesson> {
        val todayStart = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
        }.timeInMillis

        return getAllLessons().filter { it.dateTimestamp >= todayStart }
    }

    /**
     * Get lessons from this week
     */
    fun getWeekLessons(): List<StoredLesson> {
        val weekStart = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
        }.timeInMillis

        val todayStart = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
        }.timeInMillis

        return getAllLessons().filter {
            it.dateTimestamp >= weekStart && it.dateTimestamp < todayStart
        }
    }

    /**
     * Save a new lesson
     */
    fun saveLesson(lesson: StoredLesson): StoredLesson {
        val lessons = getAllLessons().toMutableList()

        // Check if lesson with same ID exists (update)
        val existingIndex = lessons.indexOfFirst { it.id == lesson.id }
        if (existingIndex >= 0) {
            lessons[existingIndex] = lesson
        } else {
            lessons.add(lesson)
        }

        // Keep only last 100 lessons
        val trimmedLessons = lessons.sortedByDescending { it.dateTimestamp }.take(100)

        prefs.edit()
            .putString(KEY_LESSONS, json.encodeToString(trimmedLessons))
            .apply()

        return lesson
    }

    /**
     * Update lesson with evaluation results
     */
    fun updateLessonEvaluation(
        lessonId: String,
        overallScore: Int,
        clarityScore: Int,
        engagementScore: Int,
        contentScore: Int,
        summary: String,
        strengths: List<String>,
        improvements: List<String>,
        advice: List<String>,
        transcript: String,
        durationSeconds: Int,
        teacherRatio: Int = 0,
        studentRatio: Int = 0,
        questionsAsked: Int = 0
    ): StoredLesson? {
        val lesson = getLessonById(lessonId) ?: return null

        val updated = lesson.copy(
            overallScore = overallScore,
            clarityScore = clarityScore,
            engagementScore = engagementScore,
            contentScore = contentScore,
            summary = summary,
            strengths = strengths,
            improvements = improvements,
            advice = advice,
            transcript = transcript,
            durationSeconds = durationSeconds,
            status = "completed",
            teacherRatio = teacherRatio,
            studentRatio = studentRatio,
            questionsAsked = questionsAsked
        )

        return saveLesson(updated)
    }

    /**
     * Delete a lesson
     */
    fun deleteLesson(id: String) {
        val lessons = getAllLessons().filter { it.id != id }
        prefs.edit()
            .putString(KEY_LESSONS, json.encodeToString(lessons))
            .apply()
    }

    /**
     * Get average score from completed lessons
     */
    fun getAverageScore(): Int {
        val completedLessons = getAllLessons().filter {
            it.status == "completed" && it.overallScore > 0
        }
        return if (completedLessons.isNotEmpty()) {
            completedLessons.map { it.overallScore }.average().toInt()
        } else 0
    }

    /**
     * Get statistics for home screen
     */
    fun getHomeStats(): HomeStats {
        val lessons = getAllLessons().filter { it.status == "completed" && it.overallScore > 0 }

        if (lessons.isEmpty()) {
            return HomeStats(
                overallScore = 0,
                teacherRatio = "0%",
                studentRatio = "0%",
                questionsAsked = "0",
                totalLessons = 0,
                hasData = false
            )
        }

        val avgScore = lessons.map { it.overallScore }.average().toInt()
        val avgTeacherRatio = lessons.map { it.teacherRatio }.average().toInt()
        val avgStudentRatio = lessons.map { it.studentRatio }.average().toInt()
        val totalQuestions = lessons.sumOf { it.questionsAsked }

        return HomeStats(
            overallScore = avgScore,
            teacherRatio = "$avgTeacherRatio%",
            studentRatio = "$avgStudentRatio%",
            questionsAsked = totalQuestions.toString(),
            totalLessons = lessons.size,
            hasData = true
        )
    }

    /**
     * Clear all lessons (for testing)
     */
    fun clearAll() {
        prefs.edit().clear().apply()
    }

    /**
     * Pull the user's lessons from the server and replace the local cache.
     * Server is the source of truth; local SharedPreferences is just a cache so
     * the home screen survives uninstalls and works across devices.
     */
    suspend fun syncFromServer(api: ApiService): Boolean {
        val result = api.getLessons(limit = 100)
        if (result !is ApiResult.Success) return false

        val merged = result.data.map { remote ->
            val ev = remote.evaluation
            val transcript = remote.transcript
            val questions = transcript.count { it == '?' }
            // Try to derive teacher/student ratio from existing local copy if we have one
            val localCopy = getLessonById(remote.id.toString())
            StoredLesson(
                id = remote.id.toString(),
                groupName = remote.group_name,
                topicName = remote.topic,
                courseType = remote.course_type,
                dateTimestamp = parseServerDate(remote.created_at),
                durationSeconds = remote.duration_seconds,
                transcript = transcript,
                status = if (ev != null) "completed" else "pending",
                overallScore = ev?.overall_score ?: 0,
                clarityScore = ev?.clarity_score ?: 0,
                engagementScore = ev?.engagement_score ?: 0,
                contentScore = ev?.content_score ?: 0,
                summary = ev?.summary ?: "",
                strengths = ev?.strengths ?: emptyList(),
                improvements = ev?.improvements ?: emptyList(),
                advice = ev?.advice ?: emptyList(),
                teacherRatio = localCopy?.teacherRatio ?: 0,
                studentRatio = localCopy?.studentRatio ?: 0,
                questionsAsked = localCopy?.questionsAsked ?: questions,
            )
        }.sortedByDescending { it.dateTimestamp }

        prefs.edit()
            .putString(KEY_LESSONS, json.encodeToString(merged))
            .apply()
        return true
    }

    private fun parseServerDate(raw: String): Long {
        return try {
            // Server stores ISO timestamps; SimpleDateFormat handles both with and without ms
            val fmt = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
            fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
            fmt.parse(raw.take(19))?.time ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }
}

/**
 * Home screen statistics
 */
data class HomeStats(
    val overallScore: Int,
    val teacherRatio: String,
    val studentRatio: String,
    val questionsAsked: String,
    val totalLessons: Int,
    val hasData: Boolean
)
