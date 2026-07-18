package com.example.eyeziyo.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.ui.theme.*

// ─────────────────────────────────────────────────────────────
// Soft Educational design system — shared components
// ─────────────────────────────────────────────────────────────

/** Large rounded headline card used at the top of most screens */
@Composable
fun HeroCard(
    background: Color = Primary,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = background,
                shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp)
            )
            .statusBarsPadding()
            .padding(horizontal = Spacing.xl, vertical = Spacing.xl)
    ) {
        Column(content = content)
    }
}

/** Soft rounded card — default container throughout the app */
@Composable
fun EduCard(
    modifier: Modifier = Modifier,
    background: Color = Surface,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    if (onClick != null) {
        Card(
            modifier = modifier,
            shape = Radius.CardShape,
            colors = CardDefaults.cardColors(containerColor = background),
            elevation = CardDefaults.cardElevation(defaultElevation = Elevation.soft),
            onClick = onClick
        ) {
            Column(modifier = Modifier.padding(Spacing.xl), content = content)
        }
    } else {
        Card(
            modifier = modifier,
            shape = Radius.CardShape,
            colors = CardDefaults.cardColors(containerColor = background),
            elevation = CardDefaults.cardElevation(defaultElevation = Elevation.soft)
        ) {
            Column(modifier = Modifier.padding(Spacing.xl), content = content)
        }
    }
}

/** Coloured square icon badge used everywhere (stat cards, list rows) */
@Composable
fun IconBadge(
    icon: ImageVector,
    tint: Color,
    background: Color,
    size: Dp = 44.dp,
    iconSize: Dp = 22.dp
) {
    Surface(
        modifier = Modifier.size(size),
        shape = RoundedCornerShape(14.dp),
        color = background
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(iconSize))
        }
    }
}

/** Circular avatar with text initials */
@Composable
fun Avatar(
    text: String,
    background: Color = PrimaryBg,
    textColor: Color = Primary,
    size: Dp = 48.dp,
    fontSize: androidx.compose.ui.unit.TextUnit = 18.sp
) {
    Surface(
        modifier = Modifier.size(size),
        shape = CircleShape,
        color = background
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text.ifEmpty { "?" },
                fontSize = fontSize,
                fontWeight = FontWeight.ExtraBold,
                color = textColor
            )
        }
    }
}

/** Pill-shaped chip, used for tags, statuses, categories */
@Composable
fun Pill(
    text: String,
    background: Color,
    textColor: Color,
    icon: ImageVector? = null
) {
    Surface(
        shape = Radius.PillShape,
        color = background
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (icon != null) {
                Icon(icon, null, modifier = Modifier.size(14.dp), tint = textColor)
                Spacer(Modifier.width(6.dp))
            }
            Text(
                text,
                color = textColor,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

/** Section header with optional trailing action */
@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                title,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Ink900
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    fontSize = 12.sp,
                    color = Ink500,
                    fontWeight = FontWeight.Medium
                )
            }
        }
        if (trailing != null) trailing()
    }
}

/** Soft primary action button used for big CTAs */
@Composable
fun PrimaryActionButton(
    text: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    background: Color = Primary
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(56.dp),
        shape = Radius.ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = background,
            contentColor = Color.White,
            disabledContainerColor = Ink200,
            disabledContentColor = Ink500
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp,
            pressedElevation = 2.dp
        )
    ) {
        if (icon != null) {
            Icon(icon, null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(
            text,
            fontSize = 16.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

/** Empty state card with icon + message */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    iconTint: Color = Ink400,
    iconBg: Color = Ink100
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = Radius.CardShape,
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = Elevation.soft)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Spacing.huge),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                modifier = Modifier.size(72.dp),
                shape = CircleShape,
                color = iconBg
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, null, modifier = Modifier.size(36.dp), tint = iconTint)
                }
            }
            Spacer(Modifier.height(Spacing.lg))
            Text(
                title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Ink800
            )
            if (subtitle != null) {
                Spacer(Modifier.height(Spacing.xs))
                Text(
                    subtitle,
                    fontSize = 13.sp,
                    color = Ink500,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }
}
