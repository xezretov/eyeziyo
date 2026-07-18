package com.eyeziyo.mentor.ui.daily

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.ConfettiOverlay
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.DailyPracticeViewModel
import com.eyeziyo.mentor.util.Haptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyPracticeScreen(onOpenFlashcards: () -> Unit) {
    val vm: DailyPracticeViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val c = colors()
    val context = LocalContext.current

    Column(Modifier.fillMaxSize()) {
        Surface(color = c.bgSurface, shadowElevation = 1.dp) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.daily_title), style = MaterialTheme.typography.headlineMedium, color = c.textPrimary)
                Text(stringResource(R.string.daily_intro), style = MaterialTheme.typography.bodyMedium, color = c.textSecondary)
            }
        }
        Box(Modifier.fillMaxSize()) {
            when {
                ui.loading -> CenteredLoader()
                ui.items.isEmpty() -> EmptyState(
                    title = stringResource(R.string.daily_empty),
                    subtitle = stringResource(R.string.flashcards_title),
                    emoji = "⚡",
                    actionLabel = stringResource(R.string.flashcards_title),
                    onAction = onOpenFlashcards,
                )
                ui.finished -> {
                    val correct = ui.items.withIndex().count { (i, q) -> ui.answers[i] == q.correctIndex }
                    val score = if (ui.items.isEmpty()) 0 else (correct * 100 / ui.items.size)
                    val color = when {
                        score >= 80 -> c.success
                        score >= 50 -> c.warning
                        else -> c.danger
                    }
                    Column(
                        Modifier.fillMaxSize().padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("$score%", fontSize = 64.sp, fontWeight = FontWeight.Bold, color = color)
                        Text(stringResource(R.string.test_score_label, correct, ui.items.size), color = c.textSecondary)
                        Spacer(Modifier.height(20.dp))
                        Button(onClick = onOpenFlashcards, colors = ButtonDefaults.buttonColors(containerColor = c.primary)) {
                            Text(stringResource(R.string.flashcards_title))
                        }
                    }
                    if (score >= 80) ConfettiOverlay(active = true)
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(count = ui.items.size) { idx ->
                        val item = ui.items[idx]
                        val sel = ui.answers[idx]
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = c.bgSurface,
                            shadowElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("${idx + 1}. ${item.question.q}", style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                                Text(item.lesson.topic, style = MaterialTheme.typography.labelSmall, color = c.textMuted)
                                item.question.choices.forEachIndexed { cIdx, choice ->
                                    val selected = sel == cIdx
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (selected) c.primaryLight else c.bgCanvas,
                                        border = if (selected) BorderStroke(1.5.dp, c.primary) else null,
                                        modifier = Modifier.fillMaxWidth().clickable {
                                            Haptics.click(context)
                                            vm.answer(idx, cIdx)
                                        },
                                    ) {
                                        Row(
                                            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Box(
                                                Modifier
                                                    .size(22.dp).clip(RoundedCornerShape(50))
                                                    .background(if (selected) c.primary else c.border),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Text(
                                                    "ABCD"[cIdx].toString(),
                                                    color = if (selected) Color.White else c.textSecondary,
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                            Spacer(Modifier.width(10.dp))
                                            Text(choice, style = MaterialTheme.typography.bodyMedium, color = c.textPrimary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    item {
                        Button(
                            onClick = vm::finish,
                            enabled = ui.answers.size == ui.items.size,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                        ) { Text(stringResource(R.string.test_submit)) }
                        Spacer(Modifier.height(20.dp))
                    }
                }
            }
        }
    }
}
