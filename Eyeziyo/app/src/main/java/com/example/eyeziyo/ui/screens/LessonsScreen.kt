package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.StoredLesson
import com.example.eyeziyo.ui.components.*
import com.example.eyeziyo.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonsScreen(
    onStartRecording: () -> Unit = {},
    onViewLesson: (String) -> Unit = {},
    lessons: List<StoredLesson> = emptyList()
) {
    var searchQuery by remember { mutableStateOf("") }
    var activeFilter by remember { mutableStateOf("all") }

    val filters = listOf(
        "all" to "Barchasi",
        "completed" to "Tahlil qilingan"
    )

    val filteredLessons = remember(activeFilter, searchQuery, lessons) {
        lessons.filter { lesson ->
            (activeFilter == "all" || lesson.status == activeFilter) &&
            (searchQuery.isEmpty() || lesson.topicName.lowercase().contains(searchQuery.lowercase()) ||
                lesson.groupName.lowercase().contains(searchQuery.lowercase()))
        }.sortedByDescending { it.dateTimestamp }
    }

    val todayStartMs = remember {
        java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
        }.timeInMillis
    }
    val todayLessons = remember(filteredLessons) {
        filteredLessons.filter { it.dateTimestamp >= todayStartMs }
    }
    val olderLessons = remember(filteredLessons) {
        filteredLessons.filter { it.dateTimestamp < todayStartMs }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
    ) {
        // ── Hero
        HeroCard(background = Primary) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Darslar",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Text(
                        "${lessons.size} ta yozilgan",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.85f),
                        fontWeight = FontWeight.Medium
                    )
                }
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    shadowElevation = 4.dp,
                    onClick = onStartRecording
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Filled.Add,
                            "Qo'shish",
                            modifier = Modifier.size(26.dp),
                            tint = Primary
                        )
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            // Search bar embedded in hero
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color.White
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.Search, null, tint = Ink400, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    if (searchQuery.isEmpty()) {
                        Text(
                            "Darslarni qidirish...",
                            fontSize = 14.sp,
                            color = Ink400
                        )
                    }
                    androidx.compose.foundation.text.BasicTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        textStyle = androidx.compose.ui.text.TextStyle(
                            color = Ink900,
                            fontSize = 14.sp,
                            fontFamily = Nunito
                        ),
                        cursorBrush = androidx.compose.ui.graphics.SolidColor(Primary)
                    )
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        // ── Filter chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            filters.forEach { (key, label) ->
                val isSelected = activeFilter == key
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = if (isSelected) Primary else Surface,
                    shadowElevation = if (isSelected) 0.dp else 1.dp,
                    onClick = { activeFilter = key }
                ) {
                    Text(
                        label,
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) Color.White else Ink700
                    )
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        // ── List
        if (filteredLessons.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = Spacing.lg)
            ) {
                EmptyState(
                    icon = Icons.Filled.MenuBook,
                    title = "Hali darslar yo'q",
                    subtitle = "Birinchi darsni yozib boshlang",
                    iconTint = Primary,
                    iconBg = PrimaryBg
                )
                Spacer(Modifier.height(16.dp))
                PrimaryActionButton(
                    text = "Darsni boshlash",
                    icon = Icons.Filled.Mic,
                    onClick = onStartRecording,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = Spacing.lg, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (todayLessons.isNotEmpty()) {
                    item {
                        GroupLabel("Bugun", todayLessons.size)
                    }
                    items(todayLessons, key = { "t${it.id}" }) { lesson ->
                        SoftLessonCard(lesson, onClick = { onViewLesson(lesson.id) })
                    }
                }
                if (olderLessons.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(8.dp))
                        GroupLabel("Oldingi darslar", olderLessons.size)
                    }
                    items(olderLessons, key = { "o${it.id}" }) { lesson ->
                        SoftLessonCard(lesson, onClick = { onViewLesson(lesson.id) })
                    }
                }
                item { Spacer(Modifier.height(100.dp)) }
            }
        }
    }
}

@Composable
private fun GroupLabel(text: String, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text,
            fontSize = 11.sp,
            color = Ink500,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.sp
        )
        Spacer(Modifier.width(8.dp))
        Surface(
            shape = CircleShape,
            color = Ink100
        ) {
            Text(
                "$count",
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                fontSize = 10.sp,
                color = Ink600,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun SoftLessonCard(lesson: StoredLesson, onClick: () -> Unit) {
    val (icon, bg, tint) = remember(lesson.courseType) {
        when {
            lesson.courseType.contains("Backend", true) -> Triple(Icons.Filled.Code, PrimaryBg, Primary)
            lesson.courseType.contains("Frontend", true) -> Triple(Icons.Filled.Web, LavenderBg, Violet)
            lesson.courseType.contains("Mobile", true) -> Triple(Icons.Filled.PhoneAndroid, CoralBg, Coral)
            lesson.courseType.contains("Database", true) -> Triple(Icons.Filled.Storage, PeachBg, Peach)
            else -> Triple(Icons.Filled.MenuBook, SunnyBg, WarningDark)
        }
    }

    val scoreBg: Color
    val scoreFg: Color
    when {
        lesson.overallScore >= 70 -> { scoreBg = MintBg; scoreFg = SuccessDark }
        lesson.overallScore >= 50 -> { scoreBg = SunnyBg; scoreFg = WarningDark }
        lesson.overallScore > 0 -> { scoreBg = CoralBg; scoreFg = DangerDark }
        else -> { scoreBg = Ink100; scoreFg = Ink500 }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(icon = icon, tint = tint, background = bg, size = 52.dp, iconSize = 26.dp)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    lesson.topicName.ifEmpty { "Mavzusiz dars" },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink900,
                    maxLines = 1
                )
                Text(
                    lesson.groupName,
                    fontSize = 12.sp,
                    color = Ink500
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Schedule, null, modifier = Modifier.size(11.dp), tint = Ink400)
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "${lesson.formattedDate}${if (lesson.formattedDuration != null) " · ${lesson.formattedDuration}" else ""}",
                        fontSize = 11.sp,
                        color = Ink400
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = scoreBg
                ) {
                    Text(
                        if (lesson.overallScore > 0) "${lesson.overallScore}%" else "—",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = scoreFg
                    )
                }
            }
        }
    }
}
