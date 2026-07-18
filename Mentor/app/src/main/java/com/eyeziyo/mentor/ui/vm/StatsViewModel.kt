package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.repo.Repos
import com.eyeziyo.mentor.data.repo.StatsSnapshot
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

class StatsViewModel : ViewModel() {
    private val lessonsRepo = Repos.lessons
    private val statsRepo = Repos.stats
    private val streakRepo = Repos.streak

    val snapshot: StateFlow<StatsSnapshot?> = combine(
        lessonsRepo.observeLessons(),
        SessionManager.user.let { user ->
            user.value?.id?.let { streakRepo.observe(it) } ?: flowOf(null)
        },
        statsRepo.observeRecentDays(14),
    ) { lessons, streak, days ->
        statsRepo.snapshot(lessons, streak?.currentStreak ?: 0, days)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = null,
    )
}
