package com.eyeziyo.mentor.data.repo

import com.eyeziyo.mentor.data.db.ChatMessageEntity
import com.eyeziyo.mentor.data.db.MentorDatabase
import com.eyeziyo.mentor.data.net.ChatApi
import com.eyeziyo.mentor.data.net.ChatMessage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class ChatRepository(private val db: MentorDatabase) {

    fun observe(lessonId: Int): Flow<List<ChatMessage>> =
        db.chatDao().observe(lessonId).map { list -> list.map { it.toModel() } }

    /** Pulls server-side history once and replaces the local cache. */
    suspend fun refresh(lessonId: Int) {
        val history = ChatApi.history(lessonId)
        val now = System.currentTimeMillis()
        db.chatDao().clearLesson(lessonId)
        db.chatDao().insertAll(
            history.messages.map {
                ChatMessageEntity(
                    lessonId = lessonId,
                    role = it.role,
                    content = it.content,
                    createdAt = it.created_at,
                    sentAt = now,
                )
            }
        )
    }

    /**
     * Optimistic send: persist the user message locally, ping the server,
     * persist the reply. If the server fails, persist an error bubble.
     * Returns the assistant reply (or null on failure).
     */
    suspend fun send(lessonId: Int, text: String): String? {
        val now = System.currentTimeMillis()
        db.chatDao().insert(
            ChatMessageEntity(lessonId = lessonId, role = "user", content = text, createdAt = "", sentAt = now)
        )
        return runCatching {
            val res = ChatApi.send(lessonId, text)
            db.chatDao().insert(
                ChatMessageEntity(lessonId = lessonId, role = "assistant", content = res.assistant_reply, createdAt = "", sentAt = System.currentTimeMillis())
            )
            res.assistant_reply
        }.onFailure { e ->
            db.chatDao().insert(
                ChatMessageEntity(
                    lessonId = lessonId,
                    role = "assistant",
                    content = "⚠️ ${e.message ?: "Xatolik"}",
                    createdAt = "",
                    sentAt = System.currentTimeMillis(),
                )
            )
        }.getOrNull()
    }

    private fun ChatMessageEntity.toModel() = ChatMessage(
        role = role,
        content = content,
        created_at = createdAt,
    )
}
