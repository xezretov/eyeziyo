package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.DailyActivityEntity
import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.domain.DateUtil
import com.eyeziyo.mentor.domain.SubjectPalette
import com.eyeziyo.mentor.domain.SubjectStyle
import kotlinx.coroutines.flow.Flow

data class SubjectScore(val style: SubjectStyle, val avg: Int, val count: Int)
data class DayPoint(val day: String, val avgScore: Int, val tests: Int)
data class StatsSnapshot(
    val avgScore: Int,
    val lessonsDone: Int,
    val streak: Int,
    val best: SubjectScore?,
    val weak: SubjectScore?,
    val subjects: List<SubjectScore>,
    val week: List<DayPoint>,
)

class StatsRepository(private val db: MentorDatabase) {

    fun observeRecentDays(limit: Int = 14): Flow<List<DailyActivityEntity>> =
        db.dailyActivityDao().observeRecent(limit)

    suspend fun recordTest(score: Int) = bumpToday(testsTaken = 1, score = score)
    suspend fun recordFlashcards(count: Int) = bumpToday(flashcardsReviewed = count)
    suspend fun recordChat() = bumpToday(chatMessages = 1)

    private suspend fun bumpToday(testsTaken: Int = 0, flashcardsReviewed: Int = 0, chatMessages: Int = 0, score: Int? = null) {
        val day = DateUtil.todayIso()
        val current = db.dailyActivityDao().forDay(day) ?: DailyActivityEntity(day, 0, 0, 0, 0, 0)
        val updated = current.copy(
            testsTaken = current.testsTaken + testsTaken,
            flashcardsReviewed = current.flashcardsReviewed + flashcardsReviewed,
            chatMessages = current.chatMessages + chatMessages,
            totalScore = current.totalScore + (score ?: 0),
            totalScoreCount = current.totalScoreCount + (if (score != null) 1 else 0),
        )
        db.dailyActivityDao().upsert(updated)
    }

    /** Computed from MentorLesson list (which already contains attempt_score). */
    fun snapshot(lessons: List<MentorLesson>, currentStreak: Int, days: List<DailyActivityEntity>): StatsSnapshot {
        val attempted = lessons.filter { it.attempt_score != null }
        val avgScore = if (attempted.isEmpty()) 0
        else attempted.sumOf { it.attempt_score!! } / attempted.size

        val grouped: Map<SubjectStyle, List<MentorLesson>> = attempted.groupBy { l ->
            SubjectPalette.resolve(l.course_type, l.topic)
        }
        val subjects = grouped.map { (style, list) ->
            SubjectScore(
                style = style,
                avg = list.sumOf { it.attempt_score!! } / list.size,
                count = list.size,
            )
        }.sortedByDescending { it.avg }

        val week = days.sortedBy { it.day }.map {
            DayPoint(
                day = it.day,
                avgScore = if (it.totalScoreCount > 0) it.totalScore / it.totalScoreCount else 0,
                tests = it.testsTaken,
            )
        }

        return StatsSnapshot(
            avgScore = avgScore,
            lessonsDone = attempted.size,
            streak = currentStreak,
            best = subjects.firstOrNull { it.count >= 1 },
            weak = subjects.lastOrNull { it.count >= 1 }?.takeIf { it != subjects.firstOrNull() },
            subjects = subjects,
            week = week,
        )
    }
}
