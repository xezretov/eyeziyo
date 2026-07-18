package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.data.db.StreakEntity
import com.eyeziyo.mentor.domain.DateUtil
import kotlinx.coroutines.flow.Flow

/**
 * Streak rules:
 * - Any tracked activity (test taken / flashcard reviewed / chat sent) bumps
 *   today into the streak.
 * - Missing a day => streak resets to 1 the next time something happens,
 *   UNLESS a freeze is consumed.
 * - Freezes regenerate weekly (every 7 days from `freezeAvailableAt`).
 *   Only one freeze can save a missed day.
 */
class StreakRepository(private val db: MentorDatabase) {

    fun observe(userId: Int): Flow<StreakEntity?> = db.streakDao().observe(userId)

    suspend fun get(userId: Int): StreakEntity? = db.streakDao().get(userId)

    suspend fun ensure(userId: Int): StreakEntity {
        val existing = db.streakDao().get(userId)
        if (existing != null) return existing
        val today = DateUtil.todayIso()
        val seed = StreakEntity(
            userId = userId,
            currentStreak = 0,
            longestStreak = 0,
            lastActiveDay = "",
            freezeAvailableAt = today,
            freezeUsedToday = false,
        )
        db.streakDao().upsert(seed)
        return seed
    }

    suspend fun recordActivity(userId: Int): StreakEntity {
        val today = DateUtil.todayIso()
        val state = ensure(userId)
        if (state.lastActiveDay == today) return state // already counted

        val gap = if (state.lastActiveDay.isBlank()) 1 else DateUtil.daysBetween(state.lastActiveDay, today)
        val freezeReady = state.freezeAvailableAt.isNotBlank() &&
            DateUtil.daysBetween(state.freezeAvailableAt, today) >= 7

        val newCurrent = when {
            state.lastActiveDay.isBlank() -> 1
            gap == 1 -> state.currentStreak + 1
            gap == 2 && freezeReady && !state.freezeUsedToday -> state.currentStreak + 1
            else -> 1
        }
        val freezeConsumed = (gap == 2 && freezeReady && !state.freezeUsedToday)
        val updated = state.copy(
            currentStreak = newCurrent,
            longestStreak = maxOf(state.longestStreak, newCurrent),
            lastActiveDay = today,
            freezeAvailableAt = if (freezeConsumed) today else state.freezeAvailableAt,
            freezeUsedToday = freezeConsumed,
        )
        db.streakDao().upsert(updated)
        return updated
    }
}
