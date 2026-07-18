package com.eyeziyo.mentor.data.net

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

object AuthApi {
    suspend fun login(email: String, password: String): TokenResponse {
        val body = ApiClient.json.encodeToString(LoginRequest.serializer(), LoginRequest(email, password))
        return ApiClient.execute("/api/auth/login", "POST", body, TokenResponse.serializer())
    }

    suspend fun me(): MentorUser =
        ApiClient.execute("/api/users/me", "GET", null, MentorUser.serializer())
}

object LessonsApi {
    suspend fun list(): List<MentorLesson> =
        ApiClient.execute("/api/mentor/lessons", "GET", null, ListSerializer(MentorLesson.serializer()))

    suspend fun detail(id: Int): MentorLessonDetail =
        ApiClient.execute("/api/mentor/lessons/$id", "GET", null, MentorLessonDetail.serializer())

    suspend fun test(lessonId: Int): TestPayload =
        ApiClient.execute("/api/mentor/lessons/$lessonId/test", "GET", null, TestPayload.serializer())

    suspend fun submitTest(lessonId: Int, answers: List<Int>): TestResult {
        val body = ApiClient.json.encodeToString(TestSubmission.serializer(), TestSubmission(answers))
        return ApiClient.execute("/api/mentor/lessons/$lessonId/test", "POST", body, TestResult.serializer())
    }
}

object ChatApi {
    suspend fun history(lessonId: Int): ChatHistory =
        ApiClient.execute("/api/mentor/lessons/$lessonId/chat", "GET", null, ChatHistory.serializer())

    suspend fun send(lessonId: Int, message: String): ChatSendResponse {
        val body = ApiClient.json.encodeToString(ChatRequest.serializer(), ChatRequest(message))
        return ApiClient.execute("/api/mentor/lessons/$lessonId/chat", "POST", body, ChatSendResponse.serializer())
    }
}

object EvaluationApi {
    suspend fun pending(): List<PendingEvaluation> =
        ApiClient.execute("/api/mentor/evaluations/pending", "GET", null,
            ListSerializer(PendingEvaluation.serializer()))

    suspend fun forLesson(lessonId: Int): EvaluationPayload =
        ApiClient.execute("/api/mentor/lessons/$lessonId/evaluation", "GET", null,
            EvaluationPayload.serializer())

    suspend fun submit(lessonId: Int, ratings: List<EvaluationRating>): EvaluationSubmitResponse {
        val body = ApiClient.json.encodeToString(
            EvaluationSubmitRequest.serializer(),
            EvaluationSubmitRequest(ratings),
        )
        return ApiClient.execute(
            "/api/mentor/lessons/$lessonId/evaluation", "POST", body,
            EvaluationSubmitResponse.serializer(),
        )
    }
}

object PushApi {
    /**
     * Best-effort: if the backend doesn't expose this endpoint we just swallow
     * the failure — push notifications still work, the server just can't target
     * this device.
     */
    suspend fun register(token: String) {
        runCatching {
            val body = ApiClient.json.encodeToString(PushRegisterRequest.serializer(), PushRegisterRequest(token))
            ApiClient.execute("/api/push/register", "POST", body, String.serializer())
        }
    }
}
