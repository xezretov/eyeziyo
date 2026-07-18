package com.eyeziyo.mentor.ui.vm

/** Tiny generic UI state — most screens fit this shape. */
sealed interface UiState<out T> {
    object Loading : UiState<Nothing>
    data class Data<T>(val value: T, val refreshing: Boolean = false) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}
