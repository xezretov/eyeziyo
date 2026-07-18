package com.eyeziyo.mentor.ui.common

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eyeziyo.mentor.ui.theme.colors

@Composable
fun CenteredLoader(text: String? = null) {
    val c = colors()
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = c.primary)
        if (text != null) {
            Spacer(Modifier.height(12.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = c.textSecondary)
        }
    }
}

@Composable
fun CenteredError(
    message: String,
    onRetry: (() -> Unit)? = null,
    icon: ImageVector = Icons.Default.ErrorOutline,
) {
    val c = colors()
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = c.danger, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(containerColor = c.primary),
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(text = androidx.compose.ui.res.stringResource(com.eyeziyo.mentor.R.string.common_retry))
            }
        }
    }
}

@Composable
fun EmptyState(
    title: String,
    subtitle: String,
    emoji: String = "📭",
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val c = colors()
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 56.sp)
        Spacer(Modifier.height(8.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, color = c.textPrimary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.textSecondary, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onAction) { Text(actionLabel, color = c.primary) }
        }
    }
}

@Composable
fun OfflineBanner() {
    val c = colors()
    Row(
        Modifier
            .fillMaxWidth()
            .background(c.warning.copy(alpha = 0.15f))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.WifiOff, contentDescription = null, tint = c.warning, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(
            androidx.compose.ui.res.stringResource(com.eyeziyo.mentor.R.string.common_offline),
            style = MaterialTheme.typography.labelMedium,
            color = c.warning,
        )
    }
}

/**
 * Shimmering placeholder. Use as a child of a layout that already establishes
 * size constraints. Anim is single shared infinite transition so many shimmers
 * stay in lockstep.
 */
@Composable
fun ShimmerBlock(
    height: Dp = 14.dp,
    width: Dp? = null,
    cornerRadius: Dp = 8.dp,
) {
    val c = colors()
    val transition = rememberInfiniteTransition(label = "shimmer")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1200)),
        label = "shimmer-progress",
    )
    val baseColor = if (c.isDark) Color(0xFF1F2937) else Color(0xFFE5E7EB)
    val highlight = if (c.isDark) Color(0xFF374151) else Color(0xFFF1F5F9)
    val brush = Brush.linearGradient(
        colors = listOf(baseColor, highlight, baseColor),
        start = androidx.compose.ui.geometry.Offset(progress * 800f - 400f, 0f),
        end = androidx.compose.ui.geometry.Offset(progress * 800f, 0f),
    )
    val mod = Modifier
        .let { if (width != null) it.width(width) else it.fillMaxWidth() }
        .height(height)
        .clip(RoundedCornerShape(cornerRadius))
        .background(brush)
    Box(mod)
}

@Composable
fun SkeletonRow() {
    val c = colors()
    Row(
        Modifier
            .fillMaxWidth()
            .background(c.bgSurface, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ShimmerBlock(height = 36.dp, width = 36.dp, cornerRadius = 12.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            ShimmerBlock(height = 14.dp, width = 180.dp)
            Spacer(Modifier.height(6.dp))
            ShimmerBlock(height = 10.dp, width = 110.dp)
        }
    }
}

@Composable
fun SkeletonList(count: Int = 5) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(16.dp),
    ) {
        repeat(count) { SkeletonRow() }
    }
}

