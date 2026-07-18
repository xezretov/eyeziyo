package com.eyeziyo.mentor.data.prefs

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ThemeMode { System, Light, Dark }
enum class AppLanguage(val tag: String) { System(""), Uz("uz"), Ru("ru"), En("en") }

object SettingsStore {
    private const val FILE = "mentor_settings"
    private const val K_THEME = "theme_mode"
    private const val K_LANG = "language"
    private const val K_NOTIF_STREAK = "notif_streak"
    private const val K_NOTIF_REVIEW = "notif_review"

    private lateinit var appContext: Context

    private val _theme = MutableStateFlow(ThemeMode.System)
    val theme: StateFlow<ThemeMode> = _theme.asStateFlow()

    private val _language = MutableStateFlow(AppLanguage.System)
    val language: StateFlow<AppLanguage> = _language.asStateFlow()

    private val _notifStreak = MutableStateFlow(true)
    val notifStreak: StateFlow<Boolean> = _notifStreak.asStateFlow()

    private val _notifReview = MutableStateFlow(true)
    val notifReview: StateFlow<Boolean> = _notifReview.asStateFlow()

    fun init(context: Context) {
        appContext = context.applicationContext
        val p = prefs()
        _theme.value = runCatching { ThemeMode.valueOf(p.getString(K_THEME, ThemeMode.System.name)!!) }.getOrDefault(ThemeMode.System)
        _language.value = runCatching { AppLanguage.valueOf(p.getString(K_LANG, AppLanguage.System.name)!!) }.getOrDefault(AppLanguage.System)
        _notifStreak.value = p.getBoolean(K_NOTIF_STREAK, true)
        _notifReview.value = p.getBoolean(K_NOTIF_REVIEW, true)
    }

    private fun prefs() = appContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun setTheme(value: ThemeMode) {
        prefs().edit { putString(K_THEME, value.name) }
        _theme.value = value
    }

    fun setLanguage(value: AppLanguage) {
        prefs().edit { putString(K_LANG, value.name) }
        _language.value = value
    }

    fun setNotifStreak(value: Boolean) {
        prefs().edit { putBoolean(K_NOTIF_STREAK, value) }
        _notifStreak.value = value
    }

    fun setNotifReview(value: Boolean) {
        prefs().edit { putBoolean(K_NOTIF_REVIEW, value) }
        _notifReview.value = value
    }
}
