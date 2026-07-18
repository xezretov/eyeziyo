package com.eyeziyo.mentor.util

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.eyeziyo.mentor.data.prefs.AppLanguage

object LocaleApplier {
    /**
     * Applies the saved language preference. On API 33+ we delegate to the
     * platform LocaleManager (per-app language); on older devices we use
     * AppCompat's compat layer. Empty tag = follow system.
     */
    fun apply(context: Context, lang: AppLanguage) {
        val tag = lang.tag
        if (Build.VERSION.SDK_INT >= 33) {
            val mgr = context.getSystemService(LocaleManager::class.java)
            mgr.applicationLocales = if (tag.isBlank()) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(tag)
        } else {
            AppCompatDelegate.setApplicationLocales(
                if (tag.isBlank()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag)
            )
        }
    }
}
