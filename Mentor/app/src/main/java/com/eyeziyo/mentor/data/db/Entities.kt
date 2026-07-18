package com.eyeziyo.mentor.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Entities are intentionally flat — repository maps to/from network types so
 * UI never sees Room.
 */

@Entity(tableName = "lessons")
data class LessonEntity(
    @PrimaryKey val id: Int,
    val groupName: String,
    val topic: String,
    val courseType: String,
    val durationSeconds: Int,
    val createdAt: String,
    val teacherName: String,
    val attemptScore: Int?,
    val attemptCompletedAt: String?,
    val updatedAt: Long,
)

@Entity(tableName = "lesson_tests")
data class LessonTestEntity(
    @PrimaryKey val lessonId: Int,
    val topic: String,
    val questionsJson: String,   // serialized List<QuizQuestion>
    val termsJson: String,       // serialized List<KeyTerm>
    val attemptJson: String?,    // serialized AttemptSnapshot
    val updatedAt: Long,
)

@Entity(tableName = "chat_messages")
data class ChatMessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lessonId: Int,
    val role: String,        // "user" | "assistant"
    val content: String,
    val createdAt: String,
    val sentAt: Long,
)

/**
 * Spaced-repetition state for one term (lesson_id + term as composite key).
 * SM-2 fields kept simple.
 */
@Entity(tableName = "term_progress", primaryKeys = ["lessonId", "term"])
data class TermProgressEntity(
    val lessonId: Int,
    val term: String,
    val explanation: String,
    val ease: Float,         // SM-2 EF, starts at 2.5
    val intervalDays: Int,   // current interval
    val reps: Int,           // successful reps in a row
    val dueAt: Long,         // epoch millis
    val lastReviewedAt: Long,
)

@Entity(tableName = "streak")
data class StreakEntity(
    @PrimaryKey val userId: Int,
    val currentStreak: Int,
    val longestStreak: Int,
    val lastActiveDay: String,   // ISO yyyy-MM-dd
    val freezeAvailableAt: String, // ISO yyyy-MM-dd  next time freeze regenerates
    val freezeUsedToday: Boolean,
)

@Entity(tableName = "achievements")
data class AchievementEntity(
    @PrimaryKey val key: String,
    val unlockedAt: Long,
    val progress: Int,
    val target: Int,
)

@Entity(tableName = "lesson_goals")
data class LessonGoalEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lessonId: Int,
    val text: String,
    val done: Boolean,
)

@Entity(tableName = "daily_activity")
data class DailyActivityEntity(
    @PrimaryKey val day: String,    // yyyy-MM-dd
    val testsTaken: Int,
    val flashcardsReviewed: Int,
    val chatMessages: Int,
    val totalScore: Int,
    val totalScoreCount: Int,
)

