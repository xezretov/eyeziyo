package com.eyeziyo.mentor.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.domain.SubjectPalette
import com.eyeziyo.mentor.ui.common.SkeletonList
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.HomeViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenLesson: (Int) -> Unit,
    onOpenPractice: () -> Unit,
    onOpenFlashcards: () -> Unit,
    onOpenEvaluation: (Int) -> Unit,
) {
    val vm: HomeViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val user by SessionManager.user.collectAsState()
    val c = colors()

    PullToRefreshBox(
        isRefreshing = ui.refreshing,
        onRefresh = vm::refresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        if (ui.refreshing && ui.lessons.isEmpty()) {
            SkeletonList(count = 4)
            return@PullToRefreshBox
        }

        val pending = ui.lessons.filter { it.attempt_score == null }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text(
                    text = stringResource(R.string.home_greeting,
                        user?.name?.substringBefore(" ") ?: stringResource(R.string.home_greeting_default)),
                    style = MaterialTheme.typography.headlineLarge,
                    color = c.textPrimary,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    stringResource(R.string.home_what_today),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textSecondary,
                )
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTileCompact(
                        modifier = Modifier.weight(1f),
                        title = stringResource(R.string.home_pending),
                        value = "${pending.size}",
                        background = c.primaryLight,
                        accent = c.primary,
                    )
                    StatTileCompact(
                        modifier = Modifier.weight(1f),
                        title = "🔥 ${stringResource(R.string.stats_streak)}",
                        value = (ui.streak?.currentStreak ?: 0).toString(),
                        background = c.flame.copy(alpha = 0.12f),
                        accent = c.flame,
                    )
                }
            }

            if (ui.pendingEvaluations.isNotEmpty()) {
                item {
                    PendingEvaluationsCard(
                        count = ui.pendingEvaluations.size,
                        firstTopic = ui.pendingEvaluations.first().topic,
                        firstTeacher = ui.pendingEvaluations.first().teacher_name,
                        onClick = { onOpenEvaluation(ui.pendingEvaluations.first().lesson_id) },
                    )
                }
            }

            if (ui.dueFlashcards > 0) {
                item {
                    QuickAction(
                        title = stringResource(R.string.flashcards_title),
                        subtitle = stringResource(R.string.home_review_terms, ui.dueFlashcards),
                        emoji = "🎴",
                        onClick = onOpenFlashcards,
                    )
                }
            }

            item {
                QuickAction(
                    title = stringResource(R.string.home_daily_practice),
                    subtitle = stringResource(R.string.home_daily_practice_sub),
                    emoji = "⚡",
                    onClick = onOpenPractice,
                )
            }

            if (pending.isNotEmpty()) {
                item {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.home_continue),
                        style = MaterialTheme.typography.titleSmall,
                        color = c.textSecondary,
                    )
                }
                items(pending.take(5), key = { it.id }) { l ->
                    LessonChip(l, onClick = { onOpenLesson(l.id) })
                }
            } else if (ui.lessons.isEmpty()) {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = c.bgSurface,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            stringResource(R.string.home_no_lessons),
                            modifier = Modifier.padding(20.dp),
                            color = c.textMuted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            } else {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = c.success.copy(alpha = 0.12f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            stringResource(R.string.home_all_done),
                            modifier = Modifier.padding(20.dp),
                            color = c.success,
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTileCompact(
    modifier: Modifier,
    title: String,
    value: String,
    background: androidx.compose.ui.graphics.Color,
    accent: androidx.compose.ui.graphics.Color,
) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = background,
        modifier = modifier,
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = accent, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(value, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = c.textPrimary)
        }
    }
}

@Composable
private fun QuickAction(
    title: String,
    subtitle: String,
    emoji: String,
    onClick: () -> Unit,
) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = c.bgSurface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(c.primaryLight),
                contentAlignment = Alignment.Center,
            ) { Text(emoji, fontSize = 22.sp) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = c.textSecondary)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.textMuted)
        }
    }
}

@Composable
private fun PendingEvaluationsCard(
    count: Int,
    firstTopic: String,
    firstTeacher: String,
    onClick: () -> Unit,
) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = c.flame.copy(alpha = 0.10f),
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.flame.copy(alpha = 0.20f)),
                contentAlignment = Alignment.Center,
            ) { Text("⭐", fontSize = 22.sp) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (count == 1) "Darsni baholang" else "$count ta dars baholanmagan",
                    style = MaterialTheme.typography.titleMedium,
                    color = c.textPrimary,
                )
                Text(
                    if (firstTeacher.isNotBlank()) "$firstTopic · $firstTeacher" else firstTopic,
                    style = MaterialTheme.typography.bodySmall,
                    color = c.textSecondary,
                    maxLines = 1,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.flame)
        }
    }
}

@Composable
private fun LessonChip(lesson: MentorLesson, onClick: () -> Unit) {
    val c = colors()
    val style = SubjectPalette.resolve(lesson.course_type, lesson.topic)
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = c.bgSurface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(style.color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { Icon(style.icon, contentDescription = null, tint = style.color) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    lesson.topic.ifBlank { stringResource(R.string.lesson_topic_default) },
                    style = MaterialTheme.typography.titleMedium,
                    color = c.textPrimary,
                    maxLines = 1,
                )
                Text(
                    "${lesson.group_name} · ${lesson.teacher_name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.textMuted,
                    maxLines = 1,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.textMuted)
        }
    }
}
