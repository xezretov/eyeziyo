package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.net.EvaluationPayload
import com.eyeziyo.mentor.data.net.EvaluationRating
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EvaluationUi(
    val payload: EvaluationPayload?,
    val ratings: Map<Int, Int>,        // question_id -> rating
    val loading: Boolean,
    val submitting: Boolean,
    val submittedJustNow: Boolean,
    val error: String?,
) {
    val canSubmit: Boolean
        get() = payload != null &&
                payload.questions.isNotEmpty() &&
                ratings.size == payload.questions.size &&
                !submitting
}

class EvaluationViewModel(private val lessonId: Int) : ViewModel() {
    private val repo = Repos.evaluations

    private val _ui = MutableStateFlow(
        EvaluationUi(
            payload = null,
            ratings = emptyMap(),
            loading = true,
            submitting = false,
            submittedJustNow = false,
            error = null,
        )
    )
    val ui: StateFlow<EvaluationUi> = _ui.asStateFlow()

    init { load() }

    fun load() {
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.forLesson(lessonId) }
                .onSuccess { payload ->
                    // Pre-fill ratings from previous answers if any (re-submission).
                    val pre = payload.questions.mapNotNull { q ->
                        q.previous_rating?.let { q.id to it }
                    }.toMap()
                    _ui.value = _ui.value.copy(
                        payload = payload,
                        ratings = pre,
                        loading = false,
                        submittedJustNow = false,
                    )
                }
                .onFailure {
                    _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Xatolik")
                }
        }
    }

    fun rate(questionId: Int, value: Int) {
        _ui.value = _ui.value.copy(ratings = _ui.value.ratings + (questionId to value))
    }

    fun submit() {
        val payload = _ui.value.payload ?: return
        if (_ui.value.submitting) return
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            val ratings = payload.questions.mapNotNull { q ->
                _ui.value.ratings[q.id]?.let { EvaluationRating(q.id, it) }
            }
            runCatching { repo.submit(lessonId, ratings) }
                .onSuccess {
                    _ui.value = _ui.value.copy(submitting = false, submittedJustNow = true)
                }
                .onFailure {
                    _ui.value = _ui.value.copy(
                        submitting = false,
                        error = it.message ?: "Yuborilmadi",
                    )
                }
        }
    }
}
