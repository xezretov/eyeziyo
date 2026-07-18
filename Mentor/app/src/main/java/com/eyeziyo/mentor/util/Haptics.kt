package com.eyeziyo.mentor.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

object Haptics {
    fun click(context: Context) = vibrate(context, 18, 80)
    fun success(context: Context) = vibrate(context, 30, 200)
    fun error(context: Context) = vibrate(context, 60, 220)

    private fun vibrate(context: Context, ms: Long, amplitude: Int) {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
            val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        vibrator ?: return
        if (!vibrator.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, amplitude.coerceIn(1, 255)))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(ms)
        }
    }
}

@Composable
fun rememberHapticClick(): () -> Unit {
    val context = LocalContext.current
    return { Haptics.click(context) }
}
