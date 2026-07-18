package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingFlat
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.StoredLesson
import com.example.eyeziyo.ui.components.*
import com.example.eyeziyo.ui.theme.*

@Composable
fun ReportsScreen(
    lessons: List<StoredLesson> = emptyList()
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scrollState = rememberScrollState()
    val days = listOf("Du", "Se", "Ch", "Pa", "Ju", "Sha", "Ya")

    val chartData = remember(lessons) {
        if (lessons.isEmpty()) {
            List(7) { 0f }
        } else {
            val now = System.currentTimeMillis()
            val dayMs = 24 * 60 * 60 * 1000L
            (6 downTo 0).map { daysAgo ->
                val dayStart = now - (daysAgo + 1) * dayMs
                val dayEnd = now - daysAgo * dayMs
                val dayLessons = lessons.filter { it.dateTimestamp in dayStart until dayEnd }
                if (dayLessons.isNotEmpty()) dayLessons.map { it.overallScore }.average().toFloat() else 0f
            }
        }
    }

    val completed = lessons.filter { it.status == "completed" && it.overallScore > 0 }
    val averageScore = if (completed.isNotEmpty()) completed.map { it.overallScore }.average().toInt() else 0
    val avgClarity = if (completed.isNotEmpty()) completed.map { it.clarityScore }.average().toInt() else 0
    val avgEngagement = if (completed.isNotEmpty()) completed.map { it.engagementScore }.average().toInt() else 0
    val avgContent = if (completed.isNotEmpty()) completed.map { it.contentScore }.average().toInt() else 0

    val trend: Pair<ImageVector, Color> = when {
        chartData.sum() == 0f -> Icons.AutoMirrored.Filled.TrendingFlat to Ink400
        chartData.last() > chartData.first() -> Icons.AutoMirrored.Filled.TrendingUp to Success
        chartData.last() < chartData.first() -> Icons.Filled.TrendingDown to Danger
        else -> Icons.AutoMirrored.Filled.TrendingFlat to Ink400
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .verticalScroll(scrollState)
    ) {
        // ── Hero
        HeroCard(background = Violet) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Hisobotlar",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Text(
                        "Progress va statistika",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
                IconButton(onClick = {
                    val text = buildString {
                        appendLine("📊 Eyeziyo Hisobot")
                        appendLine("Darslar: ${completed.size}")
                        appendLine("O'rtacha ball: $averageScore%")
                        appendLine("Tushunarlilik: $avgClarity%")
                        appendLine("Jalb qilish: $avgEngagement%")
                        appendLine("Kontent sifati: $avgContent%")
                    }
                    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(android.content.Intent.EXTRA_SUBJECT, "Eyeziyo Hisobot")
                        putExtra(android.content.Intent.EXTRA_TEXT, text)
                    }
                    context.startActivity(android.content.Intent.createChooser(intent, "Ulashish"))
                }) {
                    Icon(Icons.Filled.Share, "Ulashish", tint = Color.White)
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg)
        ) {
            // ── Chart card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                "So'nggi 7 kun",
                                fontSize = 11.sp,
                                color = Ink500,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                            Text(
                                "O'rtacha $averageScore%",
                                fontSize = 26.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Ink900
                            )
                        }
                        Surface(
                            shape = CircleShape,
                            color = trend.second.copy(alpha = 0.1f)
                        ) {
                            Box(
                                modifier = Modifier.size(40.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(trend.first, null, tint = trend.second, modifier = Modifier.size(22.dp))
                            }
                        }
                    }

                    Spacer(Modifier.height(20.dp))

                    LineChart(data = chartData, labels = days)
                }
            }

            Spacer(Modifier.height(Spacing.lg))

            // ── Skill breakdown
            SectionHeader("Ko'nikmalar tahlili")
            Spacer(Modifier.height(Spacing.md))

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SkillBar("Tushunarlilik", avgClarity, Primary, PrimaryBg, Icons.Filled.MicNone)
                SkillBar("Jalb qilish", avgEngagement, Violet, VioletBg, Icons.Filled.Groups)
                SkillBar("Kontent sifati", avgContent, Mint, MintBg, Icons.Filled.MenuBook)
            }

            Spacer(Modifier.height(Spacing.xl))

            // ── Totals
            SectionHeader("Umumiy ko'rsatkichlar")
            Spacer(Modifier.height(Spacing.md))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                TotalCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.MicNone,
                    value = "${completed.size}",
                    label = "Darslar",
                    tint = Primary,
                    bg = PrimaryBg
                )
                TotalCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.EmojiEvents,
                    value = "$averageScore%",
                    label = "O'rtacha ball",
                    tint = Sunny,
                    bg = SunnyBg
                )
            }

            Spacer(Modifier.height(120.dp))
        }
    }
}

@Composable
private fun LineChart(data: List<Float>, labels: List<String>) {
    val maxValue = 100f
    val chartHeight = 140.dp

    Column {
        Box(modifier = Modifier.fillMaxWidth().height(chartHeight)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                val step = w / (data.size - 1).coerceAtLeast(1)

                // Grid lines
                for (i in 0..3) {
                    val y = h * (i / 3f)
                    drawLine(
                        color = Ink100,
                        start = Offset(0f, y),
                        end = Offset(w, y),
                        strokeWidth = 1.dp.toPx()
                    )
                }

                // Line path
                val path = Path()
                val fillPath = Path()
                data.forEachIndexed { idx, value ->
                    val x = idx * step
                    val y = h - (value / maxValue) * h
                    if (idx == 0) {
                        path.moveTo(x, y)
                        fillPath.moveTo(x, h)
                        fillPath.lineTo(x, y)
                    } else {
                        path.lineTo(x, y)
                        fillPath.lineTo(x, y)
                    }
                }
                fillPath.lineTo((data.size - 1) * step, h)
                fillPath.close()

                drawPath(
                    path = fillPath,
                    brush = Brush.verticalGradient(
                        colors = listOf(Primary.copy(alpha = 0.22f), Primary.copy(alpha = 0f))
                    )
                )
                drawPath(
                    path = path,
                    color = Primary,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                )

                // Points
                data.forEachIndexed { idx, value ->
                    val x = idx * step
                    val y = h - (value / maxValue) * h
                    drawCircle(
                        color = Color.White,
                        radius = 6.dp.toPx(),
                        center = Offset(x, y)
                    )
                    drawCircle(
                        color = Primary,
                        radius = 4.dp.toPx(),
                        center = Offset(x, y)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            labels.forEach { label ->
                Text(label, fontSize = 10.sp, color = Ink400, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun SkillBar(
    name: String,
    value: Int,
    tint: Color,
    bg: Color,
    icon: ImageVector
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(icon = icon, tint = tint, background = bg)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        name,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Ink900
                    )
                    Text(
                        "$value%",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = tint
                    )
                }
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Ink100)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(value / 100f)
                            .fillMaxHeight()
                            .background(
                                Brush.horizontalGradient(listOf(tint.copy(alpha = 0.8f), tint))
                            )
                    )
                }
            }
        }
    }
}

@Composable
private fun TotalCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    tint: Color,
    bg: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Surface(
                modifier = Modifier.size(38.dp),
                shape = RoundedCornerShape(12.dp),
                color = Color.White
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, null, modifier = Modifier.size(20.dp), tint = tint)
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(value, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = Ink900)
            Text(label, fontSize = 12.sp, color = Ink700, fontWeight = FontWeight.SemiBold)
        }
    }
}
