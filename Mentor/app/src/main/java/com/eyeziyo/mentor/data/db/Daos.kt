package com.eyeziyo.mentor.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LessonDao {
    @Query("SELECT * FROM lessons ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<LessonEntity>>

    @Query("SELECT * FROM lessons WHERE id = :id")
    suspend fun byId(id: Int): LessonEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<LessonEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: LessonEntity)

    @Query("DELETE FROM lessons")
    suspend fun clear()
}

@Dao
interface LessonTestDao {
    @Query("SELECT * FROM lesson_tests WHERE lessonId = :id")
    suspend fun byId(id: Int): LessonTestEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: LessonTestEntity)
}

@Dao
interface ChatDao {
    @Query("SELECT * FROM chat_messages WHERE lessonId = :id ORDER BY id ASC")
    fun observe(id: Int): Flow<List<ChatMessageEntity>>

    @Query("SELECT * FROM chat_messages WHERE lessonId = :id ORDER BY id ASC")
    suspend fun list(id: Int): List<ChatMessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(msg: ChatMessageEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(msgs: List<ChatMessageEntity>)

    @Query("DELETE FROM chat_messages WHERE lessonId = :id")
    suspend fun clearLesson(id: Int)
}

@Dao
interface TermDao {
    @Query("SELECT * FROM term_progress")
    fun observeAll(): Flow<List<TermProgressEntity>>

    @Query("SELECT * FROM term_progress WHERE lessonId = :id")
    suspend fun forLesson(id: Int): List<TermProgressEntity>

    @Query("SELECT * FROM term_progress WHERE dueAt <= :now ORDER BY dueAt ASC LIMIT :limit")
    suspend fun due(now: Long, limit: Int = 50): List<TermProgressEntity>

    @Query("SELECT COUNT(*) FROM term_progress WHERE dueAt <= :now")
    fun observeDueCount(now: Long): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<TermProgressEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: TermProgressEntity)
}

@Dao
interface StreakDao {
    @Query("SELECT * FROM streak WHERE userId = :userId")
    fun observe(userId: Int): Flow<StreakEntity?>

    @Query("SELECT * FROM streak WHERE userId = :userId")
    suspend fun get(userId: Int): StreakEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: StreakEntity)
}

@Dao
interface AchievementDao {
    @Query("SELECT * FROM achievements")
    fun observeAll(): Flow<List<AchievementEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: AchievementEntity)

    @Query("SELECT * FROM achievements WHERE key = :key")
    suspend fun byKey(key: String): AchievementEntity?
}

@Dao
interface LessonGoalDao {
    @Query("SELECT * FROM lesson_goals WHERE lessonId = :id")
    fun observe(id: Int): Flow<List<LessonGoalEntity>>

    @Query("SELECT * FROM lesson_goals WHERE lessonId = :id")
    suspend fun list(id: Int): List<LessonGoalEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: LessonGoalEntity): Long

    @Update
    suspend fun update(item: LessonGoalEntity)

    @Query("DELETE FROM lesson_goals WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface DailyActivityDao {
    @Query("SELECT * FROM daily_activity ORDER BY day DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<DailyActivityEntity>>

    @Query("SELECT * FROM daily_activity WHERE day = :day")
    suspend fun forDay(day: String): DailyActivityEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: DailyActivityEntity)
}
