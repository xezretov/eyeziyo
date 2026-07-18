package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.text.input.ImeAction
import kotlinx.coroutines.launch
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.*
import com.example.eyeziyo.ui.components.*
import com.example.eyeziyo.ui.theme.*

@Composable
fun TeacherDetailScreen(teacherId: Int, onBack: () -> Unit) {
    val context = LocalContext.current
    val api = remember { ApiService.getInstance(context) }
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    var detail by remember { mutableStateOf<TeacherDetail?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var groupsEditing by remember { mutableStateOf(false) }

    LaunchedEffect(teacherId) {
        when (val r = api.getTeacherDetail(teacherId)) {
            is ApiResult.Success -> { detail = r.data; error = null }
            is ApiResult.Error -> { error = r.message }
        }
        isLoading = false
    }

    fun saveGroups(newGroups: List<String>) {
        val current = detail ?: return
        groupsEditing = true
        scope.launch {
            when (val r = api.updateTeacherGroups(teacherId, newGroups)) {
                is ApiResult.Success -> {
                    detail = current.copy(groups = r.data)
                    error = null
                }
                is ApiResult.Error -> error = r.message
            }
            groupsEditing = false
        }
    }

    fun scoreColor(v: Int): Color = when {
        v >= 80 -> Success
        v >= 60 -> Warning
        else -> Danger
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .verticalScroll(scrollState)
    ) {
        // ── Hero
        HeroCard(background = Violet) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.22f),
                    onClick = onBack
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            "Orqaga",
                            tint = Color.White
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    "O'qituvchi",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White.copy(alpha = 0.9f)
                )
            }

            Spacer(Modifier.height(18.dp))

            detail?.let { d ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        modifier = Modifier.size(68.dp),
                        shape = RoundedCornerShape(22.dp),
                        color = Color.White.copy(alpha = 0.22f)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                d.avatar.ifEmpty { d.name.take(2).uppercase() },
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(
                            d.name,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White
                        )
                        Text(
                            d.course_type.ifEmpty { "O'qituvchi" },
                            fontSize = 13.sp,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                        Text(
                            d.email,
                            fontSize = 11.sp,
                            color = Color.White.copy(alpha = 0.75f)
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HeroStat(Icons.Filled.EmojiEvents, "${d.average_score}%", "O'rtacha")
                    HeroStat(Icons.Filled.MicNone, "${d.total_lessons}", "Darslar")
                    HeroStat(Icons.Filled.Groups, "${d.group_stats.size}", "Guruh")
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg)
        ) {
            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxWidth().height(200.dp),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator(color = Primary) }
            } else if (error != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = DangerBg
                ) {
                    Text(error!!, modifier = Modifier.padding(14.dp), color = DangerDark, fontSize = 13.sp)
                }
            } else detail?.let { d ->
                SectionHeader("Tayinlangan guruhlar", "Qo'shish va o'chirish")
                Spacer(Modifier.height(Spacing.md))

                GroupsEditorCard(
                    groups = d.groups,
                    busy = groupsEditing,
                    onAdd = { g -> saveGroups(d.groups + g) },
                    onRemove = { g -> saveGroups(d.groups - g) }
                )

                Spacer(Modifier.height(Spacing.xl))

                SectionHeader("Guruhlar kesimida stats", "Har bir guruhning natijasi")
                Spacer(Modifier.height(Spacing.md))

                if (d.group_stats.isEmpty()) {
                    EmptyState(
                        icon = Icons.Filled.Groups,
                        title = "Guruhlar yo'q",
                        iconTint = Primary,
                        iconBg = PrimaryBg
                    )
                } else {
                    d.group_stats.forEach { g ->
                        GroupStatCard(g, ::scoreColor)
                        Spacer(Modifier.height(10.dp))
                    }
                }

                Spacer(Modifier.height(Spacing.xl))

                SectionHeader("Oxirgi darslar")
                Spacer(Modifier.height(Spacing.md))

                if (d.lessons.isEmpty()) {
                    EmptyState(
                        icon = Icons.Filled.MicNone,
                        title = "Darslar yo'q",
                        iconTint = Primary,
                        iconBg = PrimaryBg
                    )
                } else {
                    d.lessons.take(20).forEach { lesson ->
                        LessonBriefRow(lesson, ::scoreColor)
                        Spacer(Modifier.height(8.dp))
                    }
                }

                Spacer(Modifier.height(120.dp))
            }
        }
    }
}

@Composable
private fun HeroStat(icon: ImageVector, value: String, label: String) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color.White.copy(alpha = 0.22f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Column {
                Text(value, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                Text(label, fontSize = 10.sp, color = Color.White.copy(alpha = 0.8f))
            }
        }
    }
}

@Composable
private fun GroupStatCard(stat: TeacherGroupStat, scoreColor: (Int) -> Color) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconBadge(
                    icon = Icons.Filled.Class,
                    tint = Primary,
                    background = PrimaryBg
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stat.group_name,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900
                    )
                    Text(
                        stat.course_type.ifEmpty { "—" },
                        fontSize = 11.sp,
                        color = Ink500
                    )
                }
                Text(
                    "${stat.average_score}%",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = scoreColor(stat.average_score)
                )
            }

            Spacer(Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Ink100)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth((stat.average_score / 100f).coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .background(scoreColor(stat.average_score))
                )
            }

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                InlineStat(Icons.Filled.MicNone, "${stat.total_lessons} dars")
                InlineStat(Icons.Filled.Schedule, "${stat.total_duration_minutes} min")
                InlineStat(Icons.Filled.CalendarToday, formatShortDate(stat.last_lesson_date))
            }
        }
    }
}

@Composable
private fun InlineStat(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, modifier = Modifier.size(11.dp), tint = Ink400)
        Spacer(Modifier.width(4.dp))
        Text(text, fontSize = 10.sp, color = Ink500, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LessonBriefRow(lesson: TeacherLessonBrief, scoreColor: (Int) -> Color) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(
                icon = Icons.Filled.MicNone,
                tint = Ink500,
                background = Ink100,
                size = 36.dp,
                iconSize = 18.dp
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    lesson.topic.ifEmpty { "Dars" },
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink800,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "${lesson.group_name} · ${formatShortDate(lesson.created_at)}",
                    fontSize = 10.sp,
                    color = Ink500
                )
            }
            if (lesson.score > 0) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = scoreColor(lesson.score).copy(alpha = 0.12f)
                ) {
                    Text(
                        "${lesson.score}%",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = scoreColor(lesson.score)
                    )
                }
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun GroupsEditorCard(
    groups: List<String>,
    busy: Boolean,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    var newGroupText by remember { mutableStateOf("") }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            if (groups.isEmpty()) {
                Text(
                    "Hozircha guruhlar yo'q",
                    fontSize = 12.sp,
                    color = Ink500,
                    fontWeight = FontWeight.Medium
                )
            } else {
                androidx.compose.foundation.layout.FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    groups.forEach { g ->
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = PrimaryBg
                        ) {
                            Row(
                                modifier = Modifier.padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Filled.Groups,
                                    null,
                                    modifier = Modifier.size(14.dp),
                                    tint = Primary
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    g,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Primary
                                )
                                Spacer(Modifier.width(6.dp))
                                Surface(
                                    modifier = Modifier.size(22.dp),
                                    shape = CircleShape,
                                    color = Color.White,
                                    onClick = { if (!busy) onRemove(g) }
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Filled.Close,
                                            "O'chirish",
                                            modifier = Modifier.size(14.dp),
                                            tint = Primary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = newGroupText,
                    onValueChange = { newGroupText = it },
                    placeholder = { Text("Yangi guruh nomi (masalan BE7)", fontSize = 13.sp) },
                    singleLine = true,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        val t = newGroupText.trim()
                        if (t.isNotEmpty() && t !in groups) {
                            onAdd(t)
                            newGroupText = ""
                        }
                    }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = Ink200,
                        focusedContainerColor = Ink50,
                        unfocusedContainerColor = Ink50
                    )
                )
                Spacer(Modifier.width(10.dp))
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    color = if (newGroupText.isBlank() || busy) Ink200 else Primary,
                    onClick = {
                        val t = newGroupText.trim()
                        if (t.isNotEmpty() && t !in groups && !busy) {
                            onAdd(t)
                            newGroupText = ""
                        }
                    }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (busy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                Icons.Filled.Add,
                                "Qo'shish",
                                tint = Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatShortDate(raw: String?): String {
    if (raw.isNullOrEmpty()) return "—"
    return try {
        val date = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(raw.take(10))
        java.text.SimpleDateFormat("d MMM", java.util.Locale("uz")).format(date!!)
    } catch (e: Exception) {
        raw.take(10)
    }
}
