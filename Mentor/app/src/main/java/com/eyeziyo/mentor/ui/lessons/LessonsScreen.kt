package com.eyeziyo.mentor.ui.lessons

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.domain.SubjectPalette
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.common.SkeletonList
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.LessonFilter
import com.eyeziyo.mentor.ui.vm.LessonsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonsScreen(onOpenLesson: (Int) -> Unit) {
    val vm: LessonsViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val c = colors()

    Column(Modifier.fillMaxSize()) {
        Surface(color = c.bgSurface, shadowElevation = 1.dp) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(
                    stringResource(R.string.lessons_title),
                    style = MaterialTheme.typography.headlineMedium,
                    color = c.textPrimary,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = ui.query,
                    onValueChange = vm::setQuery,
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    placeholder = { Text(stringResource(R.string.lessons_search)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChipBtn(stringResource(R.string.lessons_filter_all), ui.filter == LessonFilter.All) {
                        vm.setFilter(LessonFilter.All)
                    }
                    FilterChipBtn(stringResource(R.string.lessons_filter_pending), ui.filter == LessonFilter.Pending) {
                        vm.setFilter(LessonFilter.Pending)
                    }
                    FilterChipBtn(stringResource(R.string.lessons_filter_done), ui.filter == LessonFilter.Done) {
                        vm.setFilter(LessonFilter.Done)
                    }
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                ui.refreshing && ui.lessons.isEmpty() -> SkeletonList(count = 6)
                ui.visible.isEmpty() -> EmptyState(
                    title = stringResource(R.string.lessons_empty),
                    subtitle = if (ui.query.isBlank())
                        stringResource(R.string.home_no_lessons)
                    else
                        stringResource(R.string.lessons_search),
                    emoji = "📚",
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(ui.visible, key = { it.id }) { lesson ->
                        LessonCard(lesson, onClick = { onOpenLesson(lesson.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChipBtn(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = if (selected) c.primary else c.bgCanvas,
        modifier = Modifier.clickable { onClick() },
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) androidx.compose.ui.graphics.Color.White else c.textSecondary,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}

@Composable
fun LessonCard(lesson: MentorLesson, onClick: () -> Unit) {
    val c = colors()
    val style = SubjectPalette.resolve(lesson.course_type, lesson.topic)
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = c.bgSurface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(style.color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { Icon(style.icon, contentDescription = null, tint = style.color) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    lesson.topic.ifBlank { stringResource(R.string.lesson_topic_default) },
                    style = MaterialTheme.typography.titleMedium,
                    color = c.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${lesson.group_name} · ${lesson.teacher_name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val score = lesson.attempt_score
            if (score != null) {
                val color = when {
                    score >= 80 -> c.success
                    score >= 50 -> c.warning
                    else -> c.danger
                }
                Surface(
                    color = color.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(20.dp),
                ) {
                    Text(
                        "$score%",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        color = color,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            } else {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.textMuted)
            }
        }
    }
}
