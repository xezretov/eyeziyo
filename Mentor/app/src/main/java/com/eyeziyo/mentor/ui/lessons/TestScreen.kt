package com.eyeziyo.mentor.ui.lessons

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.TestResult
import com.eyeziyo.mentor.ui.common.CenteredError
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.ConfettiOverlay
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.TestViewModel
import com.eyeziyo.mentor.util.Haptics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TestScreen(
    lessonId: Int,
    onBack: () -> Unit,
    onFinished: () -> Unit,
) {
    val vm: TestViewModel = viewModel(
        key = "test-$lessonId",
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return TestViewModel(lessonId) as T
            }
        },
    )
    val ui by vm.ui.collectAsState()
    val c = colors()
    val context = LocalContext.current

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.test_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                ui.loading -> CenteredLoader(stringResource(R.string.test_preparing))
                ui.error != null && ui.payload == null -> CenteredError(ui.error!!, onRetry = vm::load)
                ui.result != null -> ResultView(ui.result!!, onFinished)
                ui.payload != null -> {
                    val payload = ui.payload!!
                    if (payload.questions.isEmpty()) {
                        CenteredError(stringResource(R.string.test_no_questions))
                        return@Box
                    }
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            QuizProgress(
                                answered = ui.answers.size,
                                total = payload.questions.size,
                            )
                        }
                        items(count = payload.questions.size) { qIdx ->
                            val q = payload.questions[qIdx]
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = c.bgSurface,
                                shadowElevation = 1.dp,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(
                                        "${qIdx + 1}. ${q.q}",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = c.textPrimary,
                                    )
                                    q.choices.forEachIndexed { cIdx, choice ->
                                        val selected = ui.answers[qIdx] == cIdx
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = if (selected) c.primaryLight else c.bgCanvas,
                                            border = if (selected) BorderStroke(1.5.dp, c.primary) else null,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    Haptics.click(context)
                                                    vm.answer(qIdx, cIdx)
                                                },
                                        ) {
                                            Row(
                                                Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Box(
                                                    Modifier
                                                        .size(22.dp)
                                                        .clip(RoundedCornerShape(50))
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
                                                Text(choice, style = MaterialTheme.typography.bodyLarge, color = c.textPrimary)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        item {
                            Button(
                                onClick = vm::submit,
                                enabled = ui.canSubmit && !ui.submitting,
                                modifier = Modifier.fillMaxWidth().height(50.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                            ) {
                                if (ui.submitting) {
                                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                                } else {
                                    Text(stringResource(R.string.test_submit), style = MaterialTheme.typography.titleMedium)
                                }
                            }
                            ui.error?.let { Text(it, color = c.danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                            Spacer(Modifier.height(20.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuizProgress(answered: Int, total: Int) {
    val c = colors()
    val target = if (total == 0) 0f else answered.toFloat() / total
    val progress by animateFloatAsState(targetValue = target, label = "progress")
    Column {
        Text(
            stringResource(R.string.test_progress, answered, total),
            style = MaterialTheme.typography.labelMedium,
            color = c.textSecondary,
        )
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { progress },
            color = c.primary,
            trackColor = c.border,
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(6.dp)),
        )
    }
}

@Composable
private fun ResultView(result: TestResult, onDone: () -> Unit) {
    val c = colors()
    val context = LocalContext.current
    val color = when {
        result.score >= 80 -> c.success
        result.score >= 50 -> c.warning
        else -> c.danger
    }
    val celebrate = result.score >= 80

    LaunchedEffect(result) {
        if (celebrate) Haptics.success(context) else if (result.score < 50) Haptics.error(context)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = color.copy(alpha = 0.12f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${result.score}%", fontSize = 56.sp, fontWeight = FontWeight.Bold, color = color)
                        Text(
                            stringResource(R.string.test_score_label, result.correct, result.total),
                            style = MaterialTheme.typography.titleSmall,
                            color = c.textSecondary,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            stringResource(
                                when {
                                    result.score >= 80 -> R.string.test_celebrate_great
                                    result.score >= 50 -> R.string.test_celebrate_good
                                    else -> R.string.test_celebrate_try
                                }
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = color,
                        )
                    }
                }
            }
            items(count = result.results.size) { idx ->
                val r = result.results[idx]
                Surface(shape = RoundedCornerShape(14.dp), color = c.bgSurface, shadowElevation = 1.dp) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(
                                if (r.is_correct) Icons.Default.CheckCircle else Icons.Default.Cancel,
                                contentDescription = null,
                                tint = if (r.is_correct) c.success else c.danger,
                                modifier = Modifier.size(20.dp).padding(top = 2.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "${idx + 1}. ${r.q}",
                                style = MaterialTheme.typography.titleSmall,
                                color = c.textPrimary,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (!r.is_correct && r.correct_choice in r.choices.indices) {
                            Text(
                                stringResource(
                                    R.string.test_correct_answer,
                                    "ABCD"[r.correct_choice].toString(),
                                    r.choices[r.correct_choice],
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = c.success,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(start = 28.dp),
                            )
                        }
                        if (r.explanation.isNotBlank()) {
                            Text(
                                r.explanation,
                                style = MaterialTheme.typography.bodySmall,
                                color = c.textSecondary,
                                modifier = Modifier.padding(start = 28.dp),
                            )
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = onDone,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                ) { Text(stringResource(R.string.test_view_terms)) }
                Spacer(Modifier.height(20.dp))
            }
        }

        if (celebrate) ConfettiOverlay(active = true)
    }
}
