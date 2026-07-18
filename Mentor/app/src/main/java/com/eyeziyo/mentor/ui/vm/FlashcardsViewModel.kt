package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.db.TermProgressEntity
import com.eyeziyo.mentor.data.repo.Repos
import com.eyeziyo.mentor.domain.SpacedRepetition
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class FlashcardsUi(
    val queue: List<TermProgressEntity>,
    val index: Int,
    val showAnswer: Boolean,
    val reviewed: Int,
    val loading: Boolean,
) {
    val current: TermProgressEntity? get() = queue.getOrNull(index)
    val finished: Boolean get() = !loading && index >= queue.size
}

class FlashcardsViewModel : ViewModel() {
    private val repo = Repos.flashcards
    private val achievements = Repos.achievements
    private val stats = Repos.stats

    private val _ui = MutableStateFlow(FlashcardsUi(emptyList(), 0, false, 0, loading = true))
    val ui: StateFlow<FlashcardsUi> = _ui.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            val queue = repo.dueQueue()
            _ui.value = FlashcardsUi(queue, 0, false, 0, loading = false)
        }
    }

    fun reveal() {
        _ui.value = _ui.value.copy(showAnswer = true)
    }

    fun grade(grade: SpacedRepetition.Grade) {
        val current = _ui.value.current ?: return
        viewModelScope.launch {
            repo.grade(current, grade)
            stats.recordFlashcards(1)
            achievements.recordFlashcardsReviewed(1)
            _ui.value = _ui.value.copy(
                index = _ui.value.index + 1,
                showAnswer = false,
                reviewed = _ui.value.reviewed + 1,
            )
        }
    }
}
