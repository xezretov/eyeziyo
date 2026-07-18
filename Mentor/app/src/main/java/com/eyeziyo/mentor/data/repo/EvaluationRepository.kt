package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.net.EvaluationApi
import com.eyeziyo.mentor.data.net.EvaluationPayload
import com.eyeziyo.mentor.data.net.EvaluationRating
import com.eyeziyo.mentor.data.net.PendingEvaluation

/**
 * Thin pass-through to EvaluationApi. We don't cache evaluations locally
 * because the question set is admin-driven and changes server-side; stale
 * questions would let students rate things that no longer exist.
 *
 * `pending()` is the one users see most often — driving the home banner —
 * so callers should debounce manual refreshes.
 */
class EvaluationRepository {
    suspend fun pending(): List<PendingEvaluation> = EvaluationApi.pending()
    suspend fun forLesson(lessonId: Int): EvaluationPayload = EvaluationApi.forLesson(lessonId)
    suspend fun submit(lessonId: Int, ratings: List<EvaluationRating>) =
        EvaluationApi.submit(lessonId, ratings)
}
