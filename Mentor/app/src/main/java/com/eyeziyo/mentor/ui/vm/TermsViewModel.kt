package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.net.KeyTerm
import com.eyeziyo.mentor.data.repo.Repos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TermsViewModel(private val lessonId: Int) : ViewModel() {
    private val repo = Repos.lessons
    private val flashcards = Repos.flashcards

    private val _state = MutableStateFlow<UiState<List<KeyTerm>>>(UiState.Loading)
    val state: StateFlow<UiState<List<KeyTerm>>> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = UiState.Loading
        viewModelScope.launch {
            runCatching { repo.test(lessonId) }
                .onSuccess { p ->
                    flashcards.seedFromTerms(lessonId, p.key_terms)
                    _state.value = UiState.Data(p.key_terms)
                }
                .onFailure { _state.value = UiState.Error(it.message ?: "Xatolik") }
        }
    }
}
