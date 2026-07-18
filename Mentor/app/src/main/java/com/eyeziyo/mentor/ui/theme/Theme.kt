package com.eyeziyo.mentor.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.eyeziyo.mentor.data.prefs.SettingsStore
import com.eyeziyo.mentor.data.prefs.ThemeMode

/**
 * App color palettes split into a light and a dark variant. UI code reads from
 * `LocalMentorColors.current` (semantic) instead of MaterialTheme directly so
 * we can keep brand-specific tokens (PrimaryLight, AiBubble, etc.) without
 * stuffing them into Material3's color scheme.
 */
data class MentorColorTokens(
    val primary: Color,
    val primaryDark: Color,
    val primaryLight: Color,
    val accent: Color,
    val accentLight: Color,
    val bgCanvas: Color,
    val bgSurface: Color,
    val bgElevated: Color,
    val border: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val userBubble: Color,
    val aiBubble: Color,
    val onUserBubble: Color,
    val onAiBubble: Color,
    val flame: Color,
    val isDark: Boolean,
)

val LightTokens = MentorColorTokens(
    primary = Color(0xFF7C3AED),
    primaryDark = Color(0xFF6D28D9),
    primaryLight = Color(0xFFEDE9FE),
    accent = Color(0xFF06B6D4),
    accentLight = Color(0xFFCFFAFE),
    bgCanvas = Color(0xFFF8FAFC),
    bgSurface = Color(0xFFFFFFFF),
    bgElevated = Color(0xFFFFFFFF),
    border = Color(0xFFE2E8F0),
    textPrimary = Color(0xFF0F172A),
    textSecondary = Color(0xFF475569),
    textMuted = Color(0xFF94A3B8),
    success = Color(0xFF10B981),
    warning = Color(0xFFF59E0B),
    danger = Color(0xFFEF4444),
    userBubble = Color(0xFF7C3AED),
    aiBubble = Color(0xFFF1F5F9),
    onUserBubble = Color.White,
    onAiBubble = Color(0xFF0F172A),
    flame = Color(0xFFF97316),
    isDark = false,
)

val DarkTokens = MentorColorTokens(
    primary = Color(0xFFA78BFA),
    primaryDark = Color(0xFF8B5CF6),
    primaryLight = Color(0xFF312E62),
    accent = Color(0xFF22D3EE),
    accentLight = Color(0xFF164E5C),
    bgCanvas = Color(0xFF0B1120),
    bgSurface = Color(0xFF111827),
    bgElevated = Color(0xFF1F2937),
    border = Color(0xFF1F2937),
    textPrimary = Color(0xFFF1F5F9),
    textSecondary = Color(0xFFCBD5E1),
    textMuted = Color(0xFF64748B),
    success = Color(0xFF34D399),
    warning = Color(0xFFFBBF24),
    danger = Color(0xFFF87171),
    userBubble = Color(0xFF7C3AED),
    aiBubble = Color(0xFF1E293B),
    onUserBubble = Color.White,
    onAiBubble = Color(0xFFE2E8F0),
    flame = Color(0xFFFB923C),
    isDark = true,
)

val LocalMentorColors = staticCompositionLocalOf { LightTokens }

/**
 * Backwards-compat accessor. Prefer `colors()` (which reads the composition
 * local and respects dark mode) — these statics always return light values.
 */
@Suppress("ObjectPropertyName")
object MentorColors {
    val Primary get() = LightTokens.primary
    val PrimaryDark get() = LightTokens.primaryDark
    val PrimaryLight get() = LightTokens.primaryLight
    val Accent get() = LightTokens.accent
    val BgCanvas get() = LightTokens.bgCanvas
    val BgSurface get() = LightTokens.bgSurface
    val Border get() = LightTokens.border
    val TextPrimary get() = LightTokens.textPrimary
    val TextSecondary get() = LightTokens.textSecondary
    val TextMuted get() = LightTokens.textMuted
    val Success get() = LightTokens.success
    val Warning get() = LightTokens.warning
    val Danger get() = LightTokens.danger
    val UserBubble get() = LightTokens.userBubble
    val AiBubble get() = LightTokens.aiBubble

    val Scheme = lightColorScheme(
        primary = LightTokens.primary, onPrimary = Color.White,
        secondary = LightTokens.accent, onSecondary = Color.White,
        background = LightTokens.bgCanvas, onBackground = LightTokens.textPrimary,
        surface = LightTokens.bgSurface, onSurface = LightTokens.textPrimary,
        error = LightTokens.danger, onError = Color.White,
    )
}

@Composable
fun colors(): MentorColorTokens = LocalMentorColors.current

private fun schemeFor(t: MentorColorTokens) = if (t.isDark) {
    darkColorScheme(
        primary = t.primary, onPrimary = Color.White,
        secondary = t.accent, onSecondary = Color.Black,
        background = t.bgCanvas, onBackground = t.textPrimary,
        surface = t.bgSurface, onSurface = t.textPrimary,
        surfaceVariant = t.bgElevated, onSurfaceVariant = t.textSecondary,
        error = t.danger, onError = Color.White,
        outline = t.border,
    )
} else {
    lightColorScheme(
        primary = t.primary, onPrimary = Color.White,
        secondary = t.accent, onSecondary = Color.White,
        background = t.bgCanvas, onBackground = t.textPrimary,
        surface = t.bgSurface, onSurface = t.textPrimary,
        surfaceVariant = t.bgElevated, onSurfaceVariant = t.textSecondary,
        error = t.danger, onError = Color.White,
        outline = t.border,
    )
}

private val MentorTypography = Typography(
    displayLarge = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.Bold, lineHeight = 48.sp),
    displayMedium = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp),
    displaySmall = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 32.sp),
    headlineLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 28.sp),
    headlineMedium = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp),
    headlineSmall = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp),
    titleLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    titleMedium = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    titleSmall = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun MentorTheme(content: @Composable () -> Unit) {
    val mode by SettingsStore.theme.collectAsState()
    val isDark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val tokens = if (isDark) DarkTokens else LightTokens
    CompositionLocalProvider(LocalMentorColors provides tokens) {
        MaterialTheme(
            colorScheme = schemeFor(tokens),
            typography = MentorTypography,
            content = content,
        )
    }
}
