package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.db.AchievementEntity
import com.eyeziyo.mentor.data.repo.Repos
import com.eyeziyo.mentor.domain.Achievement
import com.eyeziyo.mentor.domain.AchievementCatalog
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class AchievementCardUi(
    val def: Achievement,
    val unlocked: Boolean,
    val progress: Int,
    val unlockedAt: Long,
)

class AchievementsViewModel : ViewModel() {
    private val repo = Repos.achievements

    val cards: StateFlow<List<AchievementCardUi>> = repo.observeAll()
        .map { byKey: Map<String, AchievementEntity> ->
            AchievementCatalog.all.map { def ->
                val rec = byKey[def.key]
                AchievementCardUi(
                    def = def,
                    unlocked = (rec?.unlockedAt ?: 0L) > 0L,
                    progress = rec?.progress ?: 0,
                    unlockedAt = rec?.unlockedAt ?: 0L,
                )
            }.sortedBy { it.unlocked.let { u -> if (u) 0 else 1 } }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList(),
        )
}
