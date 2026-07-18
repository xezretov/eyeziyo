package com.eyeziyo.mentor.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        LessonEntity::class,
        LessonTestEntity::class,
        ChatMessageEntity::class,
        TermProgressEntity::class,
        StreakEntity::class,
        AchievementEntity::class,
        LessonGoalEntity::class,
        DailyActivityEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class MentorDatabase : RoomDatabase() {
    abstract fun lessonDao(): LessonDao
    abstract fun lessonTestDao(): LessonTestDao
    abstract fun chatDao(): ChatDao
    abstract fun termDao(): TermDao
    abstract fun streakDao(): StreakDao
    abstract fun achievementDao(): AchievementDao
    abstract fun lessonGoalDao(): LessonGoalDao
    abstract fun dailyActivityDao(): DailyActivityDao

    companion object {
        @Volatile private var INSTANCE: MentorDatabase? = null

        fun get(context: Context): MentorDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                MentorDatabase::class.java,
                "mentor.db",
            )
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
                .also { INSTANCE = it }
        }
    }
}
