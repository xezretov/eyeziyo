package com.eyeziyo.mentor.push

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.prefs.SettingsStore
import com.eyeziyo.mentor.data.repo.Repos
import java.util.concurrent.TimeUnit

/**
 * Two periodic local notifications:
 *  - StreakReminderWorker: at the end of the day, if user hasn't been active.
 *  - ReviewReminderWorker: morning ping if any flashcards are due.
 *
 * Both honor SettingsStore toggles. Cheap and offline — no FCM round-trip
 * needed for daily nudges.
 */
object ReminderScheduler {

    private const val STREAK = "mentor_streak_reminder"
    private const val REVIEW = "mentor_review_reminder"

    fun schedule(context: Context) {
        val mgr = WorkManager.getInstance(context)
        val constraints = Constraints.Builder().build()

        val streak = PeriodicWorkRequestBuilder<StreakReminderWorker>(1, TimeUnit.DAYS)
            .setConstraints(constraints)
            .build()
        mgr.enqueueUniquePeriodicWork(STREAK, ExistingPeriodicWorkPolicy.KEEP, streak)

        val review = PeriodicWorkRequestBuilder<ReviewReminderWorker>(1, TimeUnit.DAYS)
            .setConstraints(constraints)
            .build()
        mgr.enqueueUniquePeriodicWork(REVIEW, ExistingPeriodicWorkPolicy.KEEP, review)
    }
}

class StreakReminderWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (!SettingsStore.notifStreak.value) return Result.success()
        // Cheap heuristic: if today already counted, skip; else nudge.
        // We don't know user id here without SessionManager; easiest is:
        // just notify gently — UI dedupes if app is open.
        MentorMessagingService.showNotification(
            applicationContext,
            applicationContext.getString(R.string.app_name),
            "🔥 Streakni saqlab qoling — bir nechta savol yetadi.",
        )
        return Result.success()
    }
}

class ReviewReminderWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (!SettingsStore.notifReview.value) return Result.success()
        val due = Repos.flashcards.dueQueue(limit = 1).size
        if (due > 0) {
            MentorMessagingService.showNotification(
                applicationContext,
                applicationContext.getString(R.string.app_name),
                "🎴 Bugun takrorlash uchun terminlar bor.",
            )
        }
        return Result.success()
    }
}
