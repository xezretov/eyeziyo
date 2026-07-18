package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.db.LessonGoalEntity
import com.eyeziyo.mentor.data.net.MentorLessonDetail
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LessonDetailViewModel(private val lessonId: Int) : ViewModel() {
    private val lessonRepo = Repos.lessons
    private val goalsRepo = Repos.goals
    private val achievements = Repos.achievements

    private val _state = MutableStateFlow<UiState<MentorLessonDetail>>(UiState.Loading)
    val state: StateFlow<UiState<MentorLessonDetail>> = _state.asStateFlow()

    val goals: StateFlow<List<LessonGoalEntity>> = goalsRepo.observe(lessonId).stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList(),
    )

    init {
        load()
        viewModelScope.launch { achievements.recordLessonOpened() }
    }

    fun load() {
        _state.value = UiState.Loading
        viewModelScope.launch {
            runCatching { lessonRepo.lessonDetail(lessonId) }
                .onSuccess { _state.value = UiState.Data(it) }
                .onFailure { _state.value = UiState.Error(it.message ?: "Xatolik") }
        }
    }

    fun addGoal(text: String) {
        viewModelScope.launch { goalsRepo.add(lessonId, text) }
    }

    fun toggleGoal(goal: LessonGoalEntity) {
        viewModelScope.launch { goalsRepo.toggle(goal) }
    }

    fun removeGoal(id: Long) {
        viewModelScope.launch { goalsRepo.remove(id) }
    }
}
