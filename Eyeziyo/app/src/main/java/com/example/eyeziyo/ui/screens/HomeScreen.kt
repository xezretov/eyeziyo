package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.HomeStats
import com.example.eyeziyo.data.StoredLesson
import com.example.eyeziyo.ui.components.*
import com.example.eyeziyo.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun HomeScreen(
    onLogout: () -> Unit,
    onStartRecording: (String, String) -> Unit = { _, _ -> },
    onViewLesson: (String) -> Unit = {},
    groups: List<String> = listOf("BE5 - Backend dasturlash", "BE6 - Backend dasturlash"),
    stats: HomeStats? = null,
    lastLesson: StoredLesson? = null
) {
    val scrollState = rememberScrollState()
    val overallScore = stats?.overallScore ?: 0
    val teacherRatio = stats?.teacherRatio ?: "0%"
    val studentRatio = stats?.studentRatio ?: "0%"
    val questionsStr = stats?.questionsAsked ?: "0"
    val hasData = stats?.hasData ?: false

    val today = remember {
        SimpleDateFormat("EEEE, d MMMM", Locale("uz")).format(Date())
    }

    var showStartDialog by remember { mutableStateOf(false) }
    var selectedGroup by remember { mutableStateOf("") }
    var lessonTopic by remember { mutableStateOf("") }

    if (showStartDialog) {
        StartLessonDialog(
            groups = groups,
            selectedGroup = selectedGroup,
            onSelectGroup = { selectedGroup = it },
            lessonTopic = lessonTopic,
            onTopicChange = { lessonTopic = it },
            onConfirm = {
                showStartDialog = false
                onStartRecording(selectedGroup, lessonTopic)
            },
            onDismiss = { showStartDialog = false }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .verticalScroll(scrollState)
    ) {
        // ── Hero greeting
        HeroCard(background = Primary) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Salom 👋",
                        fontSize = 14.sp,
                        color = Color.White.copy(alpha = 0.85f),
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        "Yangi dars yozishga tayyormisiz?",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        lineHeight = 28.sp
                    )
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color.White.copy(alpha = 0.2f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Filled.CalendarToday, null, modifier = Modifier.size(13.dp), tint = Color.White)
                            Spacer(Modifier.width(6.dp))
                            Text(
                                today,
                                fontSize = 11.sp,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
                IconButton(onClick = onLogout) {
                    Icon(
                        Icons.AutoMirrored.Filled.Logout,
                        "Chiqish",
                        tint = Color.White
                    )
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg)
        ) {
            // ── Start recording big button
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Surface,
                shadowElevation = 6.dp,
                onClick = { showStartDialog = true }
            ) {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        modifier = Modifier.size(52.dp),
                        shape = RoundedCornerShape(18.dp),
                        color = CoralBg
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Filled.Mic,
                                null,
                                tint = Coral,
                                modifier = Modifier.size(26.dp)
                            )
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Darsni boshlash",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Ink900
                        )
                        Text(
                            "AI tahlil bilan yozish",
                            fontSize = 12.sp,
                            color = Ink500
                        )
                    }
                    Surface(
                        modifier = Modifier.size(36.dp),
                        shape = CircleShape,
                        color = Primary
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Filled.ArrowForward,
                                null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(Spacing.lg))

            // ── Overall score circular card
            OverallScoreCard(
                score = overallScore,
                hasData = hasData,
                totalLessons = stats?.totalLessons ?: 0
            )

            Spacer(Modifier.height(Spacing.lg))

            // ── Metric pastel grid
            SectionHeader("Bu hafta tahlil", "Asosiy ko'rsatkichlar")
            Spacer(Modifier.height(Spacing.md))

            val teacherRatioNum = teacherRatio.replace("%", "").toIntOrNull() ?: 0
            val studentRatioNum = studentRatio.replace("%", "").toIntOrNull() ?: 0
            val questionsNum = questionsStr.toIntOrNull() ?: 0

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                PastelMetricCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.RecordVoiceOver,
                    value = teacherRatio,
                    label = "Nutqingiz",
                    tint = Violet,
                    bg = VioletBg,
                    hint = if (teacherRatioNum > 70) "Bir oz kam" else "Yaxshi"
                )
                PastelMetricCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.Groups,
                    value = studentRatio,
                    label = "O'quvchilar",
                    tint = Primary,
                    bg = PrimaryBg,
                    hint = if (studentRatioNum >= 40) "A'lo" else "Ko'paytiring"
                )
            }

            Spacer(Modifier.height(Spacing.md))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                PastelMetricCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.QuestionMark,
                    value = questionsStr,
                    label = "Savollar",
                    tint = Sunny,
                    bg = SunnyBg,
                    hint = if (questionsNum >= 5) "Optimal" else "Ko'paytiring"
                )
                PastelMetricCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Filled.MenuBook,
                    value = "${stats?.totalLessons ?: 0}",
                    label = "Darslar",
                    tint = Mint,
                    bg = MintBg,
                    hint = "Jami"
                )
            }

            Spacer(Modifier.height(Spacing.xl))

            // ── AI tips
            AiTipsCard(lastLesson = lastLesson)

            Spacer(Modifier.height(Spacing.lg))

            // ── Last lesson or empty state
            if (lastLesson != null && lastLesson.transcript.isNotEmpty()) {
                LastLessonCard(
                    lesson = lastLesson,
                    onClick = { onViewLesson(lastLesson.id) }
                )
            } else {
                EmptyState(
                    icon = Icons.Filled.Mic,
                    title = "Hali darslar yozilmagan",
                    subtitle = "Birinchi darsni yozib, AI tahlilini oling",
                    iconTint = Primary,
                    iconBg = PrimaryBg
                )
            }

            Spacer(Modifier.height(120.dp))
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Components
// ═══════════════════════════════════════════════════════════════════

@Composable
private fun OverallScoreCard(score: Int, hasData: Boolean, totalLessons: Int) {
    val label = when {
        !hasData -> "Yangi"
        score >= 70 -> "Yuqori"
        score >= 50 -> "O'rtacha"
        else -> "Past"
    }
    val labelBg = when {
        !hasData -> PrimaryBg
        score >= 70 -> MintBg
        score >= 50 -> SunnyBg
        else -> CoralBg
    }
    val labelFg = when {
        !hasData -> Primary
        score >= 70 -> SuccessDark
        score >= 50 -> WarningDark
        else -> DangerDark
    }
    val description = when {
        !hasData -> "Birinchi darsni yozib boshlang"
        score >= 70 -> "Ajoyib darslar!"
        score >= 50 -> "Yaxshi ketyapsiz"
        else -> "Takomillashtirish kerak"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(130.dp),
                contentAlignment = Alignment.Center
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val stroke = 14.dp.toPx()
                    val radius = (size.minDimension - stroke) / 2
                    val topLeft = Offset(
                        (size.width - 2 * radius) / 2,
                        (size.height - 2 * radius) / 2
                    )
                    val arcSize = Size(radius * 2, radius * 2)
                    drawArc(
                        color = Ink100,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = topLeft,
                        size = arcSize,
                        style = Stroke(stroke, cap = StrokeCap.Round)
                    )
                    drawArc(
                        brush = Brush.sweepGradient(
                            colors = listOf(Primary, Accent, Violet, Primary)
                        ),
                        startAngle = -90f,
                        sweepAngle = 360f * (score / 100f),
                        useCenter = false,
                        topLeft = topLeft,
                        size = arcSize,
                        style = Stroke(stroke, cap = StrokeCap.Round)
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "$score",
                        fontSize = 42.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900
                    )
                    Text(
                        "ball",
                        fontSize = 12.sp,
                        color = Ink500,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(Modifier.width(20.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "Umumiy ball",
                    fontSize = 12.sp,
                    color = Ink500,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(6.dp))
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = labelBg
                ) {
                    Text(
                        label,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                        color = labelFg,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    description,
                    fontSize = 14.sp,
                    color = Ink800,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 18.sp
                )
                if (hasData) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "$totalLessons ta dars tahlil qilindi",
                        fontSize = 11.sp,
                        color = Ink500
                    )
                }
            }
        }
    }
}

@Composable
private fun PastelMetricCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String,
    tint: Color,
    bg: Color,
    hint: String
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
            Spacer(Modifier.height(14.dp))
            Text(
                value,
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Ink900
            )
            Text(
                label,
                fontSize = 12.sp,
                color = Ink700,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(4.dp))
            Text(
                hint,
                fontSize = 10.sp,
                color = tint,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun AiTipsCard(lastLesson: StoredLesson?) {
    val tips: List<Pair<ImageVector, String>> = if (lastLesson != null && lastLesson.advice.isNotEmpty()) {
        listOf(
            Icons.Filled.Lightbulb to lastLesson.advice.getOrNull(0).orEmpty(),
            Icons.AutoMirrored.Filled.TrendingUp to lastLesson.advice.getOrNull(1).orEmpty(),
            Icons.Filled.AutoAwesome to lastLesson.advice.getOrNull(2).orEmpty()
        ).filter { it.second.isNotEmpty() }
    } else if (lastLesson != null && lastLesson.improvements.isNotEmpty()) {
        lastLesson.improvements.take(2).mapIndexed { idx, t ->
            (if (idx == 0) Icons.AutoMirrored.Filled.TrendingUp else Icons.Filled.Lightbulb) to t
        }
    } else {
        listOf(
            Icons.Filled.GpsFixed to "Birinchi darsni yozib, AI tavsiyalarini oling",
            Icons.Filled.Insights to "Har bir dars avtomatik tahlil qilinadi"
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(Violet, Lavender, Primary)
                )
            )
            .padding(22.dp)
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = RoundedCornerShape(14.dp),
                    color = Color.White.copy(alpha = 0.22f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Filled.AutoAwesome,
                            null,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "AI tavsiyalari",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Text(
                        "${tips.size} ta maslahat",
                        fontSize = 11.sp,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            tips.forEach { (icon, text) ->
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    shape = RoundedCornerShape(14.dp),
                    color = Color.White.copy(alpha = 0.15f)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            icon,
                            null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp).offset(y = 2.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text,
                            fontSize = 13.sp,
                            color = Color.White,
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LastLessonCard(lesson: StoredLesson, onClick: () -> Unit) {
    val scoreBg = when {
        lesson.overallScore >= 70 -> MintBg
        lesson.overallScore >= 50 -> SunnyBg
        else -> CoralBg
    }
    val scoreFg = when {
        lesson.overallScore >= 70 -> SuccessDark
        lesson.overallScore >= 50 -> WarningDark
        else -> DangerDark
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "OXIRGI DARS",
                        fontSize = 10.sp,
                        color = Ink400,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        lesson.topicName,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900,
                        maxLines = 1
                    )
                    Text(
                        lesson.groupName,
                        fontSize = 12.sp,
                        color = Ink500
                    )
                }
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = scoreBg
                ) {
                    Text(
                        "${lesson.overallScore}%",
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = scoreFg
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Ink50
            ) {
                Text(
                    lesson.transcript.take(140) + if (lesson.transcript.length > 140) "..." else "",
                    modifier = Modifier.padding(14.dp),
                    fontSize = 12.sp,
                    color = Ink600,
                    lineHeight = 18.sp
                )
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CalendarToday, null, modifier = Modifier.size(12.dp), tint = Ink400)
                    Spacer(Modifier.width(4.dp))
                    Text(lesson.formattedDate, fontSize = 11.sp, color = Ink400)
                    if (lesson.formattedDuration != null) {
                        Spacer(Modifier.width(12.dp))
                        Icon(Icons.Filled.Schedule, null, modifier = Modifier.size(12.dp), tint = Ink400)
                        Spacer(Modifier.width(4.dp))
                        Text(lesson.formattedDuration!!, fontSize = 11.sp, color = Ink400)
                    }
                }
                Text(
                    "Ko'rish →",
                    fontSize = 12.sp,
                    color = Primary,
                    fontWeight = FontWeight.ExtraBold
                )
            }
        }
    }
}

@Composable
private fun StartLessonDialog(
    groups: List<String>,
    selectedGroup: String,
    onSelectGroup: (String) -> Unit,
    lessonTopic: String,
    onTopicChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Yangi dars",
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Ink900
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    "Guruh",
                    fontSize = 12.sp,
                    color = Ink500,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(8.dp))
                groups.forEach { group ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        shape = RoundedCornerShape(14.dp),
                        color = if (selectedGroup == group) PrimaryBg else Ink50,
                        onClick = { onSelectGroup(group) }
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selectedGroup == group,
                                onClick = { onSelectGroup(group) },
                                colors = RadioButtonDefaults.colors(selectedColor = Primary)
                            )
                            Text(
                                group,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Ink900
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                Text(
                    "Mavzu",
                    fontSize = 12.sp,
                    color = Ink500,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = lessonTopic,
                    onValueChange = onTopicChange,
                    placeholder = { Text("Dars mavzusini yozing") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary,
                        focusedLabelColor = Primary,
                        focusedContainerColor = Ink50,
                        unfocusedContainerColor = Ink50
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = selectedGroup.isNotEmpty() && lessonTopic.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    "Boshlash",
                    fontWeight = FontWeight.ExtraBold
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Bekor", color = Ink500)
            }
        },
        containerColor = Surface,
        shape = RoundedCornerShape(28.dp)
    )
}
