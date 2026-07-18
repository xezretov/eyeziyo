package com.eyeziyo.mentor.ui.lessons

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.data.net.EvaluationQuestion
import com.eyeziyo.mentor.ui.common.CenteredError
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.ConfettiOverlay
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.EvaluationViewModel
import com.eyeziyo.mentor.util.Haptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EvaluationScreen(
    lessonId: Int,
    onBack: () -> Unit,
    onSubmitted: () -> Unit,
) {
    val vm: EvaluationViewModel = viewModel(
        key = "evaluation-$lessonId",
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return EvaluationViewModel(lessonId) as T
            }
        },
    )
    val ui by vm.ui.collectAsState()
    val c = colors()
    val context = LocalContext.current

    // Auto-redirect after success — give the confetti a moment, then back.
    LaunchedEffect(ui.submittedJustNow) {
        if (ui.submittedJustNow) {
            Haptics.success(context)
            kotlinx.coroutines.delay(1800)
            onSubmitted()
        }
    }

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text("Darsni baholang") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = c.bgSurface,
                    titleContentColor = c.textPrimary,
                ),
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                ui.loading -> CenteredLoader()
                ui.error != null && ui.payload == null -> CenteredError(ui.error!!, onRetry = vm::load)
                ui.submittedJustNow -> {
                    Column(
                        Modifier.fillMaxSize().padding(32.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = c.success,
                            modifier = Modifier.size(72.dp),
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Rahmat!",
                            style = MaterialTheme.typography.displaySmall,
                            color = c.textPrimary,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Baholaringiz yuborildi.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = c.textSecondary,
                            textAlign = TextAlign.Center,
                        )
                    }
                    ConfettiOverlay(active = true)
                }
                ui.payload?.questions.isNullOrEmpty() -> EmptyState(
                    title = "Savollar yo'q",
                    subtitle = "Bu dars uchun baholash savollari biriktirilmagan.",
                    emoji = "📋",
                )
                else -> {
                    val payload = ui.payload!!
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = c.primaryLight,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(Modifier.padding(16.dp)) {
                                    Text(
                                        payload.topic.ifBlank { "Dars" },
                                        style = MaterialTheme.typography.titleLarge,
                                        color = c.textPrimary,
                                    )
                                    if (payload.teacher_name.isNotBlank()) {
                                        Text(
                                            "O'qituvchi: ${payload.teacher_name}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = c.primary,
                                            fontWeight = FontWeight.Medium,
                                        )
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        "Quyidagi savollarga javob bering. Har bir savol uchun 1 dan ${payload.questions.firstOrNull()?.scale ?: 5} gacha tanlang.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.textSecondary,
                                    )
                                }
                            }
                        }

                        items(count = payload.questions.size) { i ->
                            val q = payload.questions[i]
                            QuestionCard(
                                index = i + 1,
                                question = q,
                                selected = ui.ratings[q.id],
                                onSelect = { value ->
                                    Haptics.click(context)
                                    vm.rate(q.id, value)
                                },
                            )
                        }

                        item {
                            ui.error?.let {
                                Text(it, color = c.danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                            }
                            Button(
                                onClick = vm::submit,
                                enabled = ui.canSubmit,
                                modifier = Modifier.fillMaxWidth().height(52.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                            ) {
                                if (ui.submitting) {
                                    CircularProgressIndicator(
                                        color = Color.White,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(20.dp),
                                    )
                                } else {
                                    Text(
                                        if (payload.submitted) "Yangilash" else "Yuborish",
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "${ui.ratings.size} / ${payload.questions.size}",
                                style = MaterialTheme.typography.labelMedium,
                                color = c.textMuted,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(20.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuestionCard(
    index: Int,
    question: EvaluationQuestion,
    selected: Int?,
    onSelect: (Int) -> Unit,
) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = c.bgSurface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "$index. ${question.text}",
                style = MaterialTheme.typography.titleMedium,
                color = c.textPrimary,
            )
            // Rating buttons row (1..scale)
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            ) {
                for (value in 1..question.scale) {
                    RatingButton(
                        value = value,
                        selected = selected == value,
                        onClick = { onSelect(value) },
                    )
                }
            }
            // Helper labels at the extremes
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "Yomon",
                    style = MaterialTheme.typography.labelSmall,
                    color = c.textMuted,
                )
                Text(
                    "A'lo",
                    style = MaterialTheme.typography.labelSmall,
                    color = c.textMuted,
                )
            }
        }
    }
}

@Composable
private fun RatingButton(value: Int, selected: Boolean, onClick: () -> Unit) {
    val c = colors()
    val targetSize = if (selected) 52.dp else 48.dp
    val size by androidx.compose.animation.core.animateDpAsState(targetSize, label = "rating-size")
    val bg = if (selected) c.primary else c.bgCanvas
    val borderColor = if (selected) c.primary else c.border
    val textColor = if (selected) Color.White else c.textSecondary

    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(50))
            .background(bg)
            .border(
                width = if (selected) 0.dp else 1.5.dp,
                color = borderColor,
                shape = RoundedCornerShape(50),
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "$value",
            color = textColor,
            fontSize = if (selected) 20.sp else 18.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
