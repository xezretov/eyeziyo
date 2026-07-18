package com.example.eyeziyo.ui.screens

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
import kotlinx.coroutines.launch

@Composable
fun AdminScreen(
    user: User?,
    onLogout: () -> Unit,
    onTeacherClick: (Int) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val api = remember { ApiService.getInstance(context) }

    var teachers by remember { mutableStateOf<List<TeacherStats>>(emptyList()) }
    var schoolStats by remember { mutableStateOf<SchoolStats?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        loadAdminData(api) { t, s, e -> teachers = t; schoolStats = s; error = e; isLoading = false }
    }

    fun refresh() {
        isLoading = true; error = null
        scope.launch {
            loadAdminData(api) { t, s, e -> teachers = t; schoolStats = s; error = e; isLoading = false }
        }
    }

    val overallEngagement = schoolStats?.average_engagement_score ?: 0
    val topScore = teachers.maxOfOrNull { it.average_score } ?: 0
    val sortedTeachers = remember(teachers) { teachers.sortedByDescending { it.average_score } }

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Surface(
                        modifier = Modifier.size(52.dp),
                        shape = CircleShape,
                        color = Color.White.copy(alpha = 0.22f)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                (user?.avatar ?: "A"),
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            "Xush kelibsiz,",
                            fontSize = 12.sp,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                        Text(
                            user?.name ?: "Administrator",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White
                        )
                    }
                }
                Row {
                    IconButton(onClick = { refresh() }) {
                        Icon(Icons.Filled.Refresh, "Yangilash", tint = Color.White)
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.AutoMirrored.Filled.Logout, "Chiqish", tint = Color.White)
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Pill(
                text = "Admin paneli",
                background = Color.White.copy(alpha = 0.2f),
                textColor = Color.White,
                icon = Icons.Filled.AdminPanelSettings
            )
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg)
        ) {
            if (error != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = DangerBg
                ) {
                    Text(
                        error!!,
                        modifier = Modifier.padding(14.dp),
                        color = DangerDark,
                        fontSize = 13.sp
                    )
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxWidth().height(240.dp),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator(color = Primary) }
            } else {
                // ── KPI row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    BigStatCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.AutoMirrored.Filled.TrendingUp,
                        value = "$overallEngagement%",
                        label = "Maktab faolligi",
                        tint = Mint,
                        bg = MintBg
                    )
                    BigStatCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Filled.EmojiEvents,
                        value = "$topScore%",
                        label = "Eng yuqori",
                        tint = Sunny,
                        bg = SunnyBg
                    )
                }

                Spacer(Modifier.height(Spacing.md))

                // ── Metrics row
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 18.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        MetricCell(Icons.Filled.Groups, Primary, "${schoolStats?.total_teachers ?: teachers.size}", "O'qituvchi")
                        VerticalDivider(44.dp)
                        MetricCell(Icons.Filled.MicNone, Violet, "${schoolStats?.total_lessons ?: 0}", "Dars")
                        VerticalDivider(44.dp)
                        MetricCell(Icons.Filled.Schedule, Peach, "${schoolStats?.total_duration_hours ?: 0}s", "Vaqt")
                    }
                }

                Spacer(Modifier.height(Spacing.xl))

                SectionHeader(
                    title = "O'qituvchilar",
                    subtitle = "Reyting bo'yicha tartiblangan",
                    trailing = {
                        Pill(
                            text = "${teachers.size}",
                            background = PrimaryBg,
                            textColor = Primary,
                            icon = Icons.Filled.Groups
                        )
                    }
                )
                Spacer(Modifier.height(Spacing.md))

                if (sortedTeachers.isEmpty()) {
                    EmptyState(
                        icon = Icons.Filled.Groups,
                        title = "Hozircha o'qituvchilar yo'q",
                        iconTint = Primary,
                        iconBg = PrimaryBg
                    )
                } else {
                    sortedTeachers.forEachIndexed { index, teacher ->
                        RankedTeacherCard(
                            rank = index + 1,
                            teacher = teacher,
                            isTop = teacher.average_score == topScore && topScore > 0,
                            scoreColor = ::scoreColor,
                            onClick = { onTeacherClick(teacher.user_id) }
                        )
                        Spacer(Modifier.height(10.dp))
                    }
                }

                Spacer(Modifier.height(Spacing.lg))

                // ── Legend
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Text(
                            "BAHOLASH SHKALASI",
                            fontSize = 10.sp,
                            color = Ink500,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                        Spacer(Modifier.height(10.dp))
                        listOf(
                            Triple(Success, "A'lo", "80–100%"),
                            Triple(Warning, "Yaxshi", "60–79%"),
                            Triple(Danger, "Yaxshilash kerak", "0–59%")
                        ).forEach { (color, name, range) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(modifier = Modifier.size(10.dp), shape = CircleShape, color = color) {}
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    name,
                                    fontSize = 13.sp,
                                    color = Ink700,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(range, fontSize = 11.sp, color = Ink500)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(120.dp))
            }
        }
    }
}

@Composable
private fun BigStatCard(
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
        Column(modifier = Modifier.padding(18.dp)) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = RoundedCornerShape(14.dp),
                color = Color.White
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, null, modifier = Modifier.size(22.dp), tint = tint)
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(value, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Ink900)
            Text(label, fontSize = 12.sp, color = Ink700, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun VerticalDivider(height: androidx.compose.ui.unit.Dp) {
    Box(modifier = Modifier.width(1.dp).height(height).background(Ink200))
}

@Composable
private fun MetricCell(icon: ImageVector, tint: Color, value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            modifier = Modifier.size(34.dp),
            shape = RoundedCornerShape(10.dp),
            color = tint.copy(alpha = 0.12f)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, null, modifier = Modifier.size(18.dp), tint = tint)
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink900)
        Text(label, fontSize = 10.sp, color = Ink500, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun RankedTeacherCard(
    rank: Int,
    teacher: TeacherStats,
    isTop: Boolean,
    scoreColor: (Int) -> Color,
    onClick: () -> Unit
) {
    val rankBg = when (rank) {
        1 -> SunnyBg
        2 -> Ink100
        3 -> PeachBg
        else -> Ink100
    }
    val rankFg = when (rank) {
        1 -> Sunny
        2 -> Ink500
        3 -> Peach
        else -> Ink500
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
            Surface(
                modifier = Modifier.size(32.dp),
                shape = CircleShape,
                color = rankBg
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isTop) {
                        Icon(Icons.Filled.EmojiEvents, null, modifier = Modifier.size(18.dp), tint = rankFg)
                    } else {
                        Text(
                            "$rank",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = rankFg
                        )
                    }
                }
            }
            Spacer(Modifier.width(12.dp))

            Surface(
                modifier = Modifier.size(46.dp),
                shape = RoundedCornerShape(14.dp),
                color = PrimaryBg
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        teacher.avatar.ifEmpty { teacher.name.take(2).uppercase() },
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Primary
                    )
                }
            }
            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    teacher.name,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink900,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    teacher.course_type.ifEmpty { "O'qituvchi" },
                    fontSize = 11.sp,
                    color = Ink500
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.MicNone, null, modifier = Modifier.size(11.dp), tint = Ink400)
                    Spacer(Modifier.width(4.dp))
                    Text("${teacher.total_lessons} dars", fontSize = 10.sp, color = Ink400)
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${teacher.average_score}%",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = scoreColor(teacher.average_score)
                )
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .width(60.dp)
                        .height(5.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Ink100)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth((teacher.average_score / 100f).coerceIn(0f, 1f))
                            .fillMaxHeight()
                            .background(scoreColor(teacher.average_score))
                    )
                }
            }
        }
    }
}

private suspend fun loadAdminData(
    api: ApiService,
    onResult: (List<TeacherStats>, SchoolStats?, String?) -> Unit
) {
    var teachers: List<TeacherStats> = emptyList()
    var stats: SchoolStats? = null
    var error: String? = null

    when (val r = api.getTeachers()) {
        is ApiResult.Success -> teachers = r.data
        is ApiResult.Error -> error = r.message
    }
    when (val r = api.getSchoolStats()) {
        is ApiResult.Success -> stats = r.data
        is ApiResult.Error -> if (error == null) error = r.message
    }
    onResult(teachers, stats, error)
}
