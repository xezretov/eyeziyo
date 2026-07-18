package com.eyeziyo.mentor.ui.lessons

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.MentorLessonDetail
import com.eyeziyo.mentor.domain.SubjectPalette
import com.eyeziyo.mentor.ui.common.CenteredError
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.LessonDetailViewModel
import com.eyeziyo.mentor.ui.vm.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonOverviewScreen(
    lessonId: Int,
    onBack: () -> Unit,
    onStartTest: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenFlashcards: () -> Unit,
) {
    val vm: LessonDetailViewModel = viewModel(
        key = "lesson-$lessonId",
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return LessonDetailViewModel(lessonId) as T
            }
        },
    )
    val state by vm.state.collectAsState()
    val goals by vm.goals.collectAsState()
    val c = colors()

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.lesson_topic_default)) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        }
    ) { padding ->
        when (val s = state) {
            is UiState.Loading -> Box(Modifier.padding(padding)) { CenteredLoader() }
            is UiState.Error -> Box(Modifier.padding(padding)) { CenteredError(s.message, onRetry = vm::load) }
            is UiState.Data -> {
                val lesson = s.value
                LessonOverviewBody(
                    lesson = lesson,
                    goals = goals,
                    onAddGoal = vm::addGoal,
                    onToggleGoal = vm::toggleGoal,
                    onRemoveGoal = vm::removeGoal,
                    onStartTest = onStartTest,
                    onOpenTerms = onOpenTerms,
                    onOpenChat = onOpenChat,
                    onOpenFlashcards = onOpenFlashcards,
                    modifier = Modifier.padding(padding),
                )
            }
        }
    }
}

@Composable
private fun LessonOverviewBody(
    lesson: MentorLessonDetail,
    goals: List<com.eyeziyo.mentor.data.db.LessonGoalEntity>,
    onAddGoal: (String) -> Unit,
    onToggleGoal: (com.eyeziyo.mentor.data.db.LessonGoalEntity) -> Unit,
    onRemoveGoal: (Long) -> Unit,
    onStartTest: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenFlashcards: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = colors()
    val style = SubjectPalette.resolve(lesson.course_type, lesson.topic)
    var showAdd by remember { mutableStateOf(false) }
    var newGoal by remember { mutableStateOf("") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = style.color.copy(alpha = 0.12f),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(style.color.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) { androidx.compose.material3.Icon(style.icon, contentDescription = null, tint = style.color) }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(style.displayName, style = MaterialTheme.typography.labelMedium, color = style.color, fontWeight = FontWeight.SemiBold)
                        Text(
                            lesson.topic.ifBlank { stringResource(R.string.lesson_topic_default) },
                            style = MaterialTheme.typography.headlineSmall,
                            color = c.textPrimary,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "${lesson.group_name} · ${lesson.teacher_name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.textSecondary,
                )
                if (lesson.duration_seconds > 0) {
                    Text(
                        stringResource(
                            R.string.lesson_duration,
                            lesson.duration_seconds / 60,
                            lesson.duration_seconds % 60,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = c.textMuted,
                    )
                }
            }
        }

        if (lesson.attempt != null) {
            val color = when {
                lesson.attempt.score >= 80 -> c.success
                lesson.attempt.score >= 50 -> c.warning
                else -> c.danger
            }
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = c.bgSurface,
                shadowElevation = 1.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Icon(Icons.Default.CheckCircle, contentDescription = null, tint = color, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.lesson_attempt_done), style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                        Text(stringResource(R.string.lesson_attempt_score, lesson.attempt.score),
                            style = MaterialTheme.typography.bodySmall, color = c.textSecondary)
                    }
                }
            }
        }

        // Goals
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = c.bgSurface,
            shadowElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.lesson_goals_title),
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                        color = c.textPrimary,
                    )
                    TextButton(onClick = { showAdd = !showAdd }) {
                        androidx.compose.material3.Icon(if (showAdd) Icons.Default.Close else Icons.Default.Add, contentDescription = null)
                    }
                }
                goals.forEach { g ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = { onToggleGoal(g) }) {
                            androidx.compose.material3.Icon(
                                if (g.done) Icons.Default.CheckCircle else androidx.compose.material.icons.Icons.Outlined.RadioButtonUnchecked,
                                contentDescription = null,
                                tint = if (g.done) c.success else c.textMuted,
                            )
                        }
                        Text(
                            g.text,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (g.done) c.textMuted else c.textPrimary,
                        )
                        IconButton(onClick = { onRemoveGoal(g.id) }) {
                            androidx.compose.material3.Icon(Icons.Default.Close, contentDescription = null, tint = c.textMuted)
                        }
                    }
                }
                if (showAdd) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = newGoal,
                            onValueChange = { newGoal = it },
                            placeholder = { Text(stringResource(R.string.lesson_goals_add)) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(6.dp))
                        TextButton(onClick = {
                            onAddGoal(newGoal)
                            newGoal = ""
                            showAdd = false
                        }) { Text(stringResource(R.string.common_save)) }
                    }
                }
            }
        }

        ActionCard(
            icon = Icons.Default.Quiz,
            title = stringResource(if (lesson.attempt == null) R.string.lesson_action_test else R.string.lesson_action_test_again),
            subtitle = stringResource(R.string.lesson_action_test_sub),
            color = c.primary,
            onClick = onStartTest,
        )
        ActionCard(
            icon = Icons.AutoMirrored.Filled.MenuBook,
            title = stringResource(R.string.lesson_action_terms),
            subtitle = stringResource(R.string.lesson_action_terms_sub),
            color = c.accent,
            onClick = onOpenTerms,
        )
        ActionCard(
            icon = Icons.AutoMirrored.Filled.Chat,
            title = stringResource(R.string.lesson_action_chat),
            subtitle = stringResource(R.string.lesson_action_chat_sub),
            color = c.success,
            onClick = onOpenChat,
        )
        ActionCard(
            icon = Icons.Default.Style,
            title = stringResource(R.string.lesson_action_flashcards),
            subtitle = stringResource(R.string.lesson_action_flashcards_sub),
            color = c.flame,
            onClick = onOpenFlashcards,
        )
    }
}

@Composable
private fun ActionCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    color: Color,
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
                Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { androidx.compose.material3.Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(22.dp)) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = c.textSecondary)
            }
            androidx.compose.material3.Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.textMuted)
        }
    }
}
