package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.AchievementEntity
import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.domain.AchievementCatalog
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.Calendar
import java.util.Date

/**
 * Granted-once badges. The evaluator is event-driven — UI calls one of the
 * recordX functions after a relevant action and we figure out what's newly
 * unlocked. Returned list is the badges that crossed the threshold this call,
 * so UI can show a toast/snackbar.
 */
class AchievementRepository(private val db: MentorDatabase) {

    fun observeAll(): Flow<Map<String, AchievementEntity>> =
        db.achievementDao().observeAll().map { list -> list.associateBy { it.key } }

    private suspend fun bump(key: String, by: Int = 1, target: Int): AchievementEntity? {
        val existing = db.achievementDao().byKey(key)
        val newProgress = (existing?.progress ?: 0) + by
        val unlockedAt = if (newProgress >= target && (existing?.unlockedAt ?: 0L) == 0L)
            System.currentTimeMillis() else existing?.unlockedAt ?: 0L
        val updated = AchievementEntity(
            key = key,
            unlockedAt = unlockedAt,
            progress = newProgress.coerceAtMost(target),
            target = target,
        )
        db.achievementDao().upsert(updated)
        // Only return if we crossed the unlock threshold this call.
        val crossed = (existing?.unlockedAt ?: 0L) == 0L && unlockedAt != 0L
        return if (crossed) updated else null
    }

    suspend fun recordLessonOpened(): List<AchievementEntity> {
        val u = mutableListOf<AchievementEntity>()
        bump("first_lesson", target = 1)?.let(u::add)
        return u
    }

    suspend fun recordTestSubmitted(score: Int): List<AchievementEntity> {
        val u = mutableListOf<AchievementEntity>()
        bump("first_test", target = 1)?.let(u::add)
        if (score >= 100) bump("perfect_score", target = 1)?.let(u::add)
        if (score >= 80) {
            bump("eighty_x10", target = 10)?.let(u::add)
            bump("eighty_x50", target = 50)?.let(u::add)
        }
        recordTimeOfDay()?.let(u::add)
        return u
    }

    suspend fun recordFlashcardsReviewed(count: Int): List<AchievementEntity> {
        val u = mutableListOf<AchievementEntity>()
        bump("flashcards_50", by = count, target = 50)?.let(u::add)
        bump("flashcards_500", by = count, target = 500)?.let(u::add)
        return u
    }

    suspend fun recordChatSent(): List<AchievementEntity> {
        val u = mutableListOf<AchievementEntity>()
        bump("chat_100", target = 100)?.let(u::add)
        return u
    }

    suspend fun recordStreakReached(currentStreak: Int): List<AchievementEntity> {
        val u = mutableListOf<AchievementEntity>()
        // Set absolute progress for streak achievements (no incremental)
        for ((key, target) in listOf("streak_3" to 3, "streak_7" to 7, "streak_30" to 30, "streak_100" to 100)) {
            val existing = db.achievementDao().byKey(key)
            val unlockedAt = if (currentStreak >= target && (existing?.unlockedAt ?: 0L) == 0L)
                System.currentTimeMillis() else existing?.unlockedAt ?: 0L
            val updated = AchievementEntity(
                key = key,
                unlockedAt = unlockedAt,
                progress = currentStreak.coerceAtMost(target),
                target = target,
            )
            db.achievementDao().upsert(updated)
            if ((existing?.unlockedAt ?: 0L) == 0L && unlockedAt != 0L) u += updated
        }
        return u
    }

    private suspend fun recordTimeOfDay(): AchievementEntity? {
        val hour = Calendar.getInstance().apply { time = Date() }.get(Calendar.HOUR_OF_DAY)
        return when {
            hour in 0..4 -> bump("night_owl", target = 1)
            hour in 5..6 -> bump("early_bird", target = 1)
            else -> null
        }
    }

    fun catalog() = AchievementCatalog.all
}
