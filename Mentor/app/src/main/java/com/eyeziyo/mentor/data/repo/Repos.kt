package com.eyeziyo.mentor.data.repo

import android.content.Context
import com.eyeziyo.mentor.data.db.MentorDatabase

/**
 * Manual DI entry point — keeps deps obvious without dragging in Hilt.
 * One instance per process; safe because all repos are stateless aside from
 * the shared DB.
 */
object Repos {
    private lateinit var dbInstance: MentorDatabase

    val lessons by lazy { LessonRepository(dbInstance) }
    val chat by lazy { ChatRepository(dbInstance) }
    val flashcards by lazy { FlashcardRepository(dbInstance) }
    val streak by lazy { StreakRepository(dbInstance) }
    val achievements by lazy { AchievementRepository(dbInstance) }
    val stats by lazy { StatsRepository(dbInstance) }
    val goals by lazy { GoalsRepository(dbInstance) }
    val evaluations by lazy { EvaluationRepository() }

    fun init(context: Context) {
        dbInstance = MentorDatabase.get(context)
    }
}
