package com.eyeziyo.mentor.data.net

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class TokenResponse(
    val access_token: String,
    val refresh_token: String = "",
    val token_type: String = "bearer",
    val expires_in: Int = 3600,
)

@Serializable
data class RefreshRequest(val refresh_token: String)

@Serializable
data class MentorUser(
    val id: Int,
    val email: String,
    val name: String,
    val role: String,
    val avatar: String = "",
    val groups: List<String> = emptyList(),
    val course_type: String = "",
)

@Serializable
data class MentorLesson(
    val id: Int,
    val group_name: String,
    val topic: String,
    val course_type: String = "",
    val duration_seconds: Int = 0,
    val created_at: String = "",
    val teacher_name: String = "",
    val attempt_score: Int? = null,
    val attempt_completed_at: String? = null,
)

@Serializable
data class MentorLessonDetail(
    val id: Int,
    val group_name: String,
    val topic: String,
    val course_type: String = "",
    val duration_seconds: Int = 0,
    val created_at: String = "",
    val teacher_name: String = "",
    val attempt: LessonAttempt? = null,
)

@Serializable
data class LessonAttempt(
    val score: Int,
    val completed_at: String,
)

@Serializable
data class QuizQuestion(
    val q: String,
    val choices: List<String>,
)

@Serializable
data class KeyTerm(
    val term: String,
    val explanation: String,
)

@Serializable
data class TestPayload(
    val lesson_id: Int,
    val topic: String,
    val questions: List<QuizQuestion> = emptyList(),
    val key_terms: List<KeyTerm> = emptyList(),
    val attempt: AttemptSnapshot? = null,
)

@Serializable
data class AttemptSnapshot(
    val answers: List<Int> = emptyList(),
    val score: Int,
    val completed_at: String,
)

@Serializable
data class TestSubmission(val answers: List<Int>)

@Serializable
data class QuestionResult(
    val q: String,
    val choices: List<String>,
    val selected: Int,
    val correct_choice: Int,
    val is_correct: Boolean,
    val explanation: String = "",
)

@Serializable
data class TestResult(
    val lesson_id: Int,
    val score: Int,
    val total: Int,
    val correct: Int,
    val results: List<QuestionResult> = emptyList(),
    val key_terms: List<KeyTerm> = emptyList(),
)

@Serializable
data class ChatMessage(
    val role: String,
    val content: String,
    val created_at: String = "",
)

@Serializable
data class ChatHistory(
    val lesson_id: Int,
    val messages: List<ChatMessage> = emptyList(),
)

@Serializable
data class ChatRequest(val message: String)

@Serializable
data class ChatSendResponse(
    val user_message: String,
    val assistant_reply: String,
)

@Serializable
data class PushRegisterRequest(val token: String, val platform: String = "android")

@Serializable
data class PendingEvaluation(
    val lesson_id: Int,
    val topic: String,
    val group_name: String = "",
    val course_type: String = "",
    val teacher_name: String = "",
    val created_at: String = "",
    val test_completed_at: String = "",
)

@Serializable
data class EvaluationQuestion(
    val id: Int,
    val text: String,
    val scale: Int = 5,
    val subject_id: Int? = null,
    val subject_name: String? = null,
    val previous_rating: Int? = null,
)

@Serializable
data class EvaluationPayload(
    val lesson_id: Int,
    val topic: String,
    val teacher_name: String = "",
    val submitted: Boolean = false,
    val questions: List<EvaluationQuestion> = emptyList(),
)

@Serializable
data class EvaluationRating(val question_id: Int, val rating: Int)

@Serializable
data class EvaluationSubmitRequest(val ratings: List<EvaluationRating>)

@Serializable
data class EvaluationSubmitResponse(val status: String, val count: Int = 0)

@Serializable
data class ApiErrorBody(val detail: String? = null, val message: String? = null)

class ApiException(val status: Int, val detail: String? = null) : Exception(detail ?: "HTTP $status") {
    val isUnauthorized get() = status == 401
}
