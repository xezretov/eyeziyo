package com.eyeziyo.mentor.ui.flashcards

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.domain.SpacedRepetition
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.FlashcardsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlashcardsScreen(onBack: () -> Unit) {
    val vm: FlashcardsViewModel = viewModel()
    val ui by vm.ui.collectAsState()
    val c = colors()

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.flashcards_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize().padding(16.dp)) {
            when {
                ui.loading -> CenteredLoader()
                ui.queue.isEmpty() && ui.reviewed == 0 -> EmptyState(
                    title = stringResource(R.string.flashcards_empty),
                    subtitle = stringResource(R.string.terms_empty),
                    emoji = "🎴",
                )
                ui.finished -> EmptyState(
                    title = stringResource(R.string.flashcards_done),
                    subtitle = stringResource(R.string.flashcards_done_sub, ui.reviewed),
                    emoji = "🎉",
                )
                else -> {
                    val current = ui.current!!
                    Column(Modifier.fillMaxSize()) {
                        Text(
                            stringResource(R.string.flashcards_due_count, ui.queue.size - ui.index),
                            style = MaterialTheme.typography.labelMedium,
                            color = c.textSecondary,
                        )
                        Spacer(Modifier.height(12.dp))
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = c.bgSurface,
                            shadowElevation = 1.dp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .clickable(enabled = !ui.showAnswer) { vm.reveal() },
                        ) {
                            Column(
                                Modifier.padding(20.dp).fillMaxSize(),
                                verticalArrangement = Arrangement.Center,
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(
                                    current.term,
                                    style = MaterialTheme.typography.displaySmall,
                                    color = c.primary,
                                    textAlign = TextAlign.Center,
                                )
                                AnimatedVisibility(visible = ui.showAnswer) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Spacer(Modifier.height(20.dp))
                                        androidx.compose.material3.HorizontalDivider(color = c.border, modifier = Modifier.padding(horizontal = 80.dp))
                                        Spacer(Modifier.height(16.dp))
                                        Text(
                                            current.explanation,
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = c.textPrimary,
                                            textAlign = TextAlign.Center,
                                        )
                                    }
                                }
                                if (!ui.showAnswer) {
                                    Spacer(Modifier.height(20.dp))
                                    Text(
                                        stringResource(R.string.flashcards_show_answer) + " 👆",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.textMuted,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (ui.showAnswer) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                GradeButton(stringResource(R.string.flashcards_again), c.danger, Modifier.weight(1f)) {
                                    vm.grade(SpacedRepetition.Grade.Again)
                                }
                                GradeButton(stringResource(R.string.flashcards_hard), c.warning, Modifier.weight(1f)) {
                                    vm.grade(SpacedRepetition.Grade.Hard)
                                }
                                GradeButton(stringResource(R.string.flashcards_good), c.success, Modifier.weight(1f)) {
                                    vm.grade(SpacedRepetition.Grade.Good)
                                }
                                GradeButton(stringResource(R.string.flashcards_easy), c.accent, Modifier.weight(1f)) {
                                    vm.grade(SpacedRepetition.Grade.Easy)
                                }
                            }
                        } else {
                            Button(
                                onClick = vm::reveal,
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                            ) { Text(stringResource(R.string.flashcards_show_answer)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GradeButton(label: String, color: Color, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(48.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.15f)).clickable { onClick() },
        color = Color.Transparent,
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(label, color = color, fontWeight = FontWeight.SemiBold)
        }
    }
}
