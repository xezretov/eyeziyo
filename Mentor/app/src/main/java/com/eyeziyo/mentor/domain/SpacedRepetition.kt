package com.eyeziyo.mentor.domain

import com.eyeziyo.mentor.data.db.TermProgressEntity
import kotlin.math.max

/**
 * Slimmed-down SM-2 (Anki style):
 *   quality 0..5 maps to: Again=1, Hard=3, Good=4, Easy=5
 *   - Again -> reset reps, interval=1 day
 *   - Hard  -> interval *= 1.2,  ease -= 0.15
 *   - Good  -> if reps==0 -> 1d, reps==1 -> 6d, else interval *= ease
 *   - Easy  -> Good * 1.3 bonus,  ease += 0.10
 *
 * EF clamp: [1.3, 2.7]. Interval clamp: max 365.
 */
object SpacedRepetition {

    enum class Grade(val q: Int) { Again(1), Hard(3), Good(4), Easy(5) }

    private const val DAY_MS = 24L * 60 * 60 * 1000

    fun initial(lessonId: Int, term: String, explanation: String, now: Long): TermProgressEntity =
        TermProgressEntity(
            lessonId = lessonId,
            term = term,
            explanation = explanation,
            ease = 2.5f,
            intervalDays = 0,
            reps = 0,
            dueAt = now,
            lastReviewedAt = 0,
        )

    fun apply(state: TermProgressEntity, grade: Grade, now: Long): TermProgressEntity {
        var ease = state.ease
        var reps = state.reps
        var interval: Int

        when (grade) {
            Grade.Again -> {
                reps = 0
                interval = 1
                ease = max(1.3f, ease - 0.20f)
            }
            Grade.Hard -> {
                interval = max(1, (state.intervalDays * 1.2f).toInt())
                ease = max(1.3f, ease - 0.15f)
                reps += 1
            }
            Grade.Good -> {
                interval = when (reps) {
                    0 -> 1
                    1 -> 6
                    else -> max(1, (state.intervalDays * ease).toInt())
                }
                reps += 1
            }
            Grade.Easy -> {
                interval = when (reps) {
                    0 -> 2
                    1 -> 8
                    else -> max(1, (state.intervalDays * ease * 1.3f).toInt())
                }
                ease = (ease + 0.10f).coerceAtMost(2.7f)
                reps += 1
            }
        }
        interval = interval.coerceAtMost(365)
        return state.copy(
            ease = ease,
            intervalDays = interval,
            reps = reps,
            dueAt = now + interval * DAY_MS,
            lastReviewedAt = now,
        )
    }
}
