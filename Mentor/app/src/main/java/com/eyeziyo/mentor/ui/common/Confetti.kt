package com.eyeziyo.mentor.ui.common

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import nl.dionsegijn.konfetti.compose.KonfettiView
import nl.dionsegijn.konfetti.core.Party
import nl.dionsegijn.konfetti.core.Position
import nl.dionsegijn.konfetti.core.emitter.Emitter
import java.util.concurrent.TimeUnit

/**
 * Drop this anywhere on top of the screen and it'll fire a celebratory burst
 * once. The list of parties is built lazily so we don't hold particles in
 * composition memory after the animation ends.
 */
@Composable
fun ConfettiOverlay(active: Boolean) {
    if (!active) return
    val parties = remember {
        listOf(
            Party(
                speed = 0f,
                maxSpeed = 30f,
                damping = 0.9f,
                spread = 360,
                colors = listOf(0xFF7C3AED, 0xFF06B6D4, 0xFF10B981, 0xFFF59E0B, 0xFFEF4444).map { Color(it).hashCode() },
                emitter = Emitter(duration = 100, TimeUnit.MILLISECONDS).max(120),
                position = Position.Relative(0.5, 0.3),
            )
        )
    }
    KonfettiView(modifier = Modifier.fillMaxSize(), parties = parties)
}
