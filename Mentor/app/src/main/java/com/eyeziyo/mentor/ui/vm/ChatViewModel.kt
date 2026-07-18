package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.net.ChatMessage
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ChatViewModel(private val lessonId: Int) : ViewModel() {
    private val repo = Repos.chat
    private val achievements = Repos.achievements
    private val stats = Repos.stats

    val messages: StateFlow<List<ChatMessage>> = repo.observe(lessonId).stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList(),
    )

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { repo.refresh(lessonId) }
                .onFailure { _error.value = it.message }
            _loading.value = false
        }
    }

    fun send(text: String) {
        if (text.isBlank() || _sending.value) return
        _sending.value = true
        _error.value = null
        viewModelScope.launch {
            repo.send(lessonId, text)
            achievements.recordChatSent()
            stats.recordChat()
            _sending.value = false
        }
    }
}
