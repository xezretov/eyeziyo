package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.LessonGoalEntity
import com.eyeziyo.mentor.data.db.MentorDatabase
import kotlinx.coroutines.flow.Flow

class GoalsRepository(private val db: MentorDatabase) {
    fun observe(lessonId: Int): Flow<List<LessonGoalEntity>> = db.lessonGoalDao().observe(lessonId)

    suspend fun add(lessonId: Int, text: String) {
        if (text.isBlank()) return
        db.lessonGoalDao().insert(LessonGoalEntity(lessonId = lessonId, text = text.trim(), done = false))
    }

    suspend fun toggle(item: LessonGoalEntity) {
        db.lessonGoalDao().update(item.copy(done = !item.done))
    }

    suspend fun remove(id: Long) = db.lessonGoalDao().delete(id)
}
