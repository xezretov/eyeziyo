package com.eyeziyo.mentor.ui.stats

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.repo.DayPoint
import com.eyeziyo.mentor.data.repo.StatsSnapshot
import com.eyeziyo.mentor.data.repo.SubjectScore
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.StatsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen() {
    val vm: StatsViewModel = viewModel()
    val snap by vm.snapshot.collectAsState()
    val c = colors()

    Column(Modifier.fillMaxSize()) {
        Surface(color = c.bgSurface, shadowElevation = 1.dp) {
            Text(
                stringResource(R.string.stats_title),
                style = MaterialTheme.typography.headlineMedium,
                color = c.textPrimary,
                modifier = Modifier.padding(16.dp),
            )
        }
        when (val s = snap) {
            null -> CenteredLoader()
            else -> {
                if (s.lessonsDone == 0 && s.streak == 0) {
                    EmptyState(title = stringResource(R.string.stats_no_data), subtitle = stringResource(R.string.home_no_lessons), emoji = "📊")
                } else {
                    StatsBody(s)
                }
            }
        }
    }
}

@Composable
private fun StatsBody(s: StatsSnapshot) {
    val c = colors()
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard(stringResource(R.string.stats_avg), "${s.avgScore}%", c.primary, Modifier.weight(1f))
                StatCard(stringResource(R.string.stats_lessons_done), s.lessonsDone.toString(), c.accent, Modifier.weight(1f))
                StatCard(stringResource(R.string.stats_streak), "🔥${s.streak}", c.flame, Modifier.weight(1f))
            }
        }
        if (s.best != null) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(stringResource(R.string.stats_best_subject), style = MaterialTheme.typography.labelMedium, color = c.textSecondary)
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(s.best.style.emoji, fontSize = 24.sp)
                            Spacer(Modifier.width(8.dp))
                            Text(s.best.style.displayName, style = MaterialTheme.typography.titleMedium, color = c.textPrimary, modifier = Modifier.weight(1f))
                            Text("${s.best.avg}%", color = c.success, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        if (s.weak != null) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(stringResource(R.string.stats_weak_subject), style = MaterialTheme.typography.labelMedium, color = c.textSecondary)
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(s.weak.style.emoji, fontSize = 24.sp)
                            Spacer(Modifier.width(8.dp))
                            Text(s.weak.style.displayName, style = MaterialTheme.typography.titleMedium, color = c.textPrimary, modifier = Modifier.weight(1f))
                            Text("${s.weak.avg}%", color = c.warning, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        if (s.week.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(stringResource(R.string.stats_week_trend), style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                        Spacer(Modifier.height(12.dp))
                        WeekChart(s.week, lineColor = c.primary, gridColor = c.border)
                    }
                }
            }
        }

        if (s.subjects.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(stringResource(R.string.stats_subject_breakdown), style = MaterialTheme.typography.titleMedium, color = c.textPrimary)
                        Spacer(Modifier.height(8.dp))
                        s.subjects.forEach { ss -> SubjectRow(ss) }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, color: Color, modifier: Modifier) {
    val c = colors()
    Surface(shape = RoundedCornerShape(16.dp), color = color.copy(alpha = 0.1f), modifier = modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall, color = c.textPrimary)
        }
    }
}

@Composable
private fun SubjectRow(ss: SubjectScore) {
    val c = colors()
    Column(Modifier.padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(ss.style.emoji, fontSize = 18.sp)
            Spacer(Modifier.width(8.dp))
            Text(ss.style.displayName, style = MaterialTheme.typography.bodyMedium, color = c.textPrimary, modifier = Modifier.weight(1f))
            Text("${ss.avg}%", style = MaterialTheme.typography.labelMedium, color = ss.style.color, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { ss.avg / 100f },
            color = ss.style.color,
            trackColor = c.border,
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(6.dp)),
        )
    }
}

@Composable
private fun WeekChart(points: List<DayPoint>, lineColor: Color, gridColor: Color) {
    if (points.isEmpty()) return
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(120.dp)
            .background(Color.Transparent),
    ) {
        val w = size.width
        val h = size.height
        val maxScore = (points.maxOfOrNull { it.avgScore } ?: 100).coerceAtLeast(50)

        // grid
        for (i in 0..4) {
            val y = h * i / 4
            drawLine(
                color = gridColor.copy(alpha = 0.4f),
                start = Offset(0f, y),
                end = Offset(w, y),
                strokeWidth = 1f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)),
            )
        }
        if (points.size == 1) {
            drawCircle(lineColor, radius = 4f, center = Offset(w / 2, h - (points[0].avgScore.toFloat() / maxScore) * h))
            return@Canvas
        }
        val step = w / (points.size - 1).toFloat()
        val path = Path()
        points.forEachIndexed { i, p ->
            val x = i * step
            val y = h - (p.avgScore.toFloat() / maxScore) * h
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = lineColor, style = Stroke(width = 4f))
        points.forEachIndexed { i, p ->
            val x = i * step
            val y = h - (p.avgScore.toFloat() / maxScore) * h
            drawCircle(lineColor, radius = 5f, center = Offset(x, y))
        }
    }
}
