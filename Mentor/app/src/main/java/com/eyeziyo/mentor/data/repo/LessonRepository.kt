package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.LessonEntity
import com.eyeziyo.mentor.data.db.LessonTestEntity
import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.data.net.ApiClient
import com.eyeziyo.mentor.data.net.AttemptSnapshot
import com.eyeziyo.mentor.data.net.KeyTerm
import com.eyeziyo.mentor.data.net.LessonsApi
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.data.net.MentorLessonDetail
import com.eyeziyo.mentor.data.net.QuizQuestion
import com.eyeziyo.mentor.data.net.TestPayload
import com.eyeziyo.mentor.data.net.TestResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer

class LessonRepository(private val db: MentorDatabase) {

    fun observeLessons(): Flow<List<MentorLesson>> =
        db.lessonDao().observeAll().map { list -> list.map { it.toModel() } }

    suspend fun lessonById(id: Int): MentorLesson? = db.lessonDao().byId(id)?.toModel()

    /** Force-refresh from network and update cache. Returns the fresh list. */
    suspend fun refreshLessons(): List<MentorLesson> {
        val fresh = LessonsApi.list()
        val now = System.currentTimeMillis()
        db.lessonDao().upsertAll(fresh.map { it.toEntity(now) })
        return fresh
    }

    suspend fun lessonDetail(id: Int): MentorLessonDetail = LessonsApi.detail(id)

    /**
     * Loads the test payload, prefer cached if we have it AND attempt isn't
     * yet completed; otherwise refetch (so post-attempt `attempt` snapshot
     * shows up). Always cache the response.
     */
    suspend fun test(lessonId: Int): TestPayload {
        val cached = db.lessonTestDao().byId(lessonId)
        if (cached != null && cached.attemptJson == null) {
            // Live-fresh attempt may exist server-side; still refetch but fall back if offline.
            return runCatching { fetchAndCacheTest(lessonId) }.getOrElse { cached.toModel() }
        }
        return runCatching { fetchAndCacheTest(lessonId) }.getOrElse {
            cached?.toModel() ?: throw it
        }
    }

    private suspend fun fetchAndCacheTest(lessonId: Int): TestPayload {
        val payload = LessonsApi.test(lessonId)
        val json = ApiClient.json
        db.lessonTestDao().upsert(
            LessonTestEntity(
                lessonId = payload.lesson_id,
                topic = payload.topic,
                questionsJson = json.encodeToString(ListSerializer(QuizQuestion.serializer()), payload.questions),
                termsJson = json.encodeToString(ListSerializer(KeyTerm.serializer()), payload.key_terms),
                attemptJson = payload.attempt?.let { json.encodeToString(AttemptSnapshot.serializer(), it) },
                updatedAt = System.currentTimeMillis(),
            )
        )
        return payload
    }

    suspend fun submitTest(lessonId: Int, answers: List<Int>): TestResult =
        LessonsApi.submitTest(lessonId, answers)

    private fun MentorLesson.toEntity(now: Long) = LessonEntity(
        id = id,
        groupName = group_name,
        topic = topic,
        courseType = course_type,
        durationSeconds = duration_seconds,
        createdAt = created_at,
        teacherName = teacher_name,
        attemptScore = attempt_score,
        attemptCompletedAt = attempt_completed_at,
        updatedAt = now,
    )

    private fun LessonEntity.toModel() = MentorLesson(
        id = id,
        group_name = groupName,
        topic = topic,
        course_type = courseType,
        duration_seconds = durationSeconds,
        created_at = createdAt,
        teacher_name = teacherName,
        attempt_score = attemptScore,
        attempt_completed_at = attemptCompletedAt,
    )

    private fun LessonTestEntity.toModel(): TestPayload {
        val json = ApiClient.json
        return TestPayload(
            lesson_id = lessonId,
            topic = topic,
            questions = json.decodeFromString(ListSerializer(QuizQuestion.serializer()), questionsJson),
            key_terms = json.decodeFromString(ListSerializer(KeyTerm.serializer()), termsJson),
            attempt = attemptJson?.let { json.decodeFromString(AttemptSnapshot.serializer(), it) },
        )
    }
}
