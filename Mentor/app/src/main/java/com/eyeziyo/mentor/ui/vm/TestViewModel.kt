package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.db.AchievementEntity
import com.eyeziyo.mentor.data.net.TestPayload
import com.eyeziyo.mentor.data.net.TestResult
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TestUi(
    val payload: TestPayload?,
    val answers: Map<Int, Int>,
    val loading: Boolean,
    val submitting: Boolean,
    val result: TestResult?,
    val error: String?,
    val newlyUnlocked: List<AchievementEntity> = emptyList(),
) {
    val canSubmit: Boolean
        get() = payload != null && answers.size == payload.questions.size && payload.questions.isNotEmpty()
}

class TestViewModel(private val lessonId: Int) : ViewModel() {
    private val repo = Repos.lessons
    private val flashcards = Repos.flashcards
    private val achievements = Repos.achievements
    private val streak = Repos.streak
    private val stats = Repos.stats

    private val _ui = MutableStateFlow(TestUi(null, emptyMap(), loading = true, submitting = false, result = null, error = null))
    val ui: StateFlow<TestUi> = _ui.asStateFlow()

    init { load() }

    fun load() {
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.test(lessonId) }
                .onSuccess { p ->
                    // Seed flashcards as a side-effect — opens the SR queue early.
                    flashcards.seedFromTerms(lessonId, p.key_terms)
                    val pre = p.attempt?.answers?.withIndex()?.associate { (i, v) -> i to v } ?: emptyMap()
                    _ui.value = _ui.value.copy(payload = p, answers = pre, loading = false)
                }
                .onFailure { _ui.value = _ui.value.copy(loading = false, error = it.message ?: "Xatolik") }
        }
    }

    fun answer(q: Int, choice: Int) {
        _ui.value = _ui.value.copy(answers = _ui.value.answers + (q to choice))
    }

    fun submit() {
        val p = _ui.value.payload ?: return
        if (_ui.value.submitting) return
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            val ansList = List(p.questions.size) { _ui.value.answers[it] ?: -1 }
            runCatching { repo.submitTest(lessonId, ansList) }
                .onSuccess { res ->
                    val unlocked = mutableListOf<AchievementEntity>()
                    unlocked += achievements.recordTestSubmitted(res.score)
                    val userId = SessionManager.user.value?.id ?: -1
                    if (userId >= 0) {
                        val s = streak.recordActivity(userId)
                        unlocked += achievements.recordStreakReached(s.currentStreak)
                    }
                    stats.recordTest(res.score)
                    _ui.value = _ui.value.copy(submitting = false, result = res, newlyUnlocked = unlocked)
                    // Force lessons list refresh so dashboard reflects the new attempt.
                    runCatching { repo.refreshLessons() }
                }
                .onFailure { _ui.value = _ui.value.copy(submitting = false, error = it.message ?: "Xatolik") }
        }
    }

    fun consumeUnlocks() {
        if (_ui.value.newlyUnlocked.isNotEmpty()) {
            _ui.value = _ui.value.copy(newlyUnlocked = emptyList())
        }
    }
}
