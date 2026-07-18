package com.example.eyeziyo.ui.theme

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = SurfaceLight,
    primaryContainer = PrimaryBg,
    onPrimaryContainer = PrimaryDark,
    secondary = Accent,
    onSecondary = SurfaceLight,
    background = BackgroundLight,
    onBackground = Gray800,
    surface = SurfaceLight,
    onSurface = Gray800,
    surfaceVariant = Gray100,
    onSurfaceVariant = Gray600,
    outline = Gray300,
    outlineVariant = Gray200,
    error = Red500,
    onError = SurfaceLight,
)

@Composable
fun EyeziyoTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = Typography
    ) {
        CompositionLocalProvider(
            LocalTextStyle provides LocalTextStyle.current.copy(fontFamily = Nunito)
        ) {
            content()
        }
    }
}
