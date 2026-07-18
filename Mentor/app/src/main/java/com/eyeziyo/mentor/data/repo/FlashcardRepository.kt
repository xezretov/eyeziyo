package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.data.db.TermProgressEntity
import com.eyeziyo.mentor.data.net.KeyTerm
import com.eyeziyo.mentor.domain.SpacedRepetition

class FlashcardRepository(private val db: MentorDatabase) {

    fun observeDueCount(now: Long = System.currentTimeMillis()) =
        db.termDao().observeDueCount(now)

    suspend fun seedFromTerms(lessonId: Int, terms: List<KeyTerm>) {
        if (terms.isEmpty()) return
        val existing = db.termDao().forLesson(lessonId).associateBy { it.term }
        val now = System.currentTimeMillis()
        val toInsert = terms.mapNotNull { kt ->
            if (existing.containsKey(kt.term)) null
            else SpacedRepetition.initial(lessonId, kt.term, kt.explanation, now)
        }
        if (toInsert.isNotEmpty()) db.termDao().upsertAll(toInsert)
    }

    suspend fun dueQueue(limit: Int = 30, now: Long = System.currentTimeMillis()): List<TermProgressEntity> =
        db.termDao().due(now, limit)

    suspend fun grade(state: TermProgressEntity, grade: SpacedRepetition.Grade) {
        val updated = SpacedRepetition.apply(state, grade, System.currentTimeMillis())
        db.termDao().upsert(updated)
    }
}
