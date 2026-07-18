package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.db.StreakEntity
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.data.net.PendingEvaluation
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HomeUi(
    val lessons: List<MentorLesson>,
    val streak: StreakEntity?,
    val dueFlashcards: Int,
    val pendingEvaluations: List<PendingEvaluation>,
    val refreshing: Boolean,
)

class HomeViewModel : ViewModel() {
    private val lessonsRepo = Repos.lessons
    private val flashRepo = Repos.flashcards
    private val streakRepo = Repos.streak
    private val evalRepo = Repos.evaluations

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private val _pending = MutableStateFlow<List<PendingEvaluation>>(emptyList())

    val ui: StateFlow<HomeUi> = combine(
        lessonsRepo.observeLessons(),
        SessionManager.user.value?.id?.let { streakRepo.observe(it) } ?: flowOf(null),
        flashRepo.observeDueCount(),
        _pending,
        _refreshing,
    ) { lessons, streak, due, pending, refreshing ->
        HomeUi(lessons, streak, due, pending, refreshing)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUi(emptyList(), null, 0, emptyList(), refreshing = true),
    )

    init {
        SessionManager.user.value?.id?.let { uid ->
            viewModelScope.launch { streakRepo.ensure(uid) }
        }
        refresh()
    }

    fun refresh() {
        if (_refreshing.value) return
        _refreshing.value = true
        viewModelScope.launch {
            runCatching { lessonsRepo.refreshLessons() }
            // Pending evaluations are best-effort — never block the refresh on them.
            _pending.value = runCatching { evalRepo.pending() }.getOrDefault(emptyList())
            _refreshing.value = false
        }
    }
}
