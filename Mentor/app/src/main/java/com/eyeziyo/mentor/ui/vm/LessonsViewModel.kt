package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch

enum class LessonFilter { All, Pending, Done }

data class LessonsUi(
    val lessons: List<MentorLesson>,
    val filter: LessonFilter,
    val query: String,
    val refreshing: Boolean,
    val error: String?,
) {
    val visible: List<MentorLesson>
        get() {
            val base = when (filter) {
                LessonFilter.All -> lessons
                LessonFilter.Pending -> lessons.filter { it.attempt_score == null }
                LessonFilter.Done -> lessons.filter { it.attempt_score != null }
            }
            if (query.isBlank()) return base
            val q = query.trim().lowercase()
            return base.filter {
                it.topic.lowercase().contains(q) ||
                        it.group_name.lowercase().contains(q) ||
                        it.teacher_name.lowercase().contains(q)
            }
        }
}

class LessonsViewModel : ViewModel() {
    private val repo = Repos.lessons

    private val _filter = MutableStateFlow(LessonFilter.All)
    private val _query = MutableStateFlow("")
    private val _refreshing = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)

    val ui: StateFlow<LessonsUi> = combine(
        repo.observeLessons(), _filter, _query, _refreshing, _error,
    ) { lessons, filter, query, refreshing, error ->
        LessonsUi(lessons, filter, query, refreshing, error)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = LessonsUi(emptyList(), LessonFilter.All, "", refreshing = true, error = null),
    )

    init {
        refresh()
    }

    fun setFilter(filter: LessonFilter) { _filter.value = filter }
    fun setQuery(q: String) { _query.value = q }

    fun refresh() {
        if (_refreshing.value) return
        _refreshing.value = true
        _error.value = null
        viewModelScope.launch {
            runCatching { repo.refreshLessons() }
                .onFailure { _error.value = it.message ?: "Yuklab bo'lmadi" }
            _refreshing.value = false
        }
    }
}
