package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.StoredLesson
import com.example.eyeziyo.ui.theme.*

@Composable
fun LessonDetailScreen(
    lesson: StoredLesson,
    onBack: () -> Unit
) {
    val scrollState = rememberScrollState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0A1628), Color(0xFF0F2035), Color(0xFF0A1628))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Orqaga", tint = Color.White)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        lesson.topicName.ifEmpty { "Dars natijasi" },
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "${lesson.groupName} • ${lesson.formattedDate}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.6f)
                    )
                }
                Box(modifier = Modifier.size(48.dp))
            }

            // Results
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 16.dp)
            ) {
                Spacer(modifier = Modifier.height(8.dp))

                // Overall Score Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.08f))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "${lesson.overallScore}",
                            fontSize = 72.sp,
                            fontWeight = FontWeight.Bold,
                            color = when {
                                lesson.overallScore >= 80 -> Emerald600
                                lesson.overallScore >= 60 -> Primary
                                lesson.overallScore >= 40 -> Amber700
                                else -> Red500
                            }
                        )
                        Text(
                            text = when {
                                lesson.overallScore >= 80 -> "A'lo"
                                lesson.overallScore >= 60 -> "Yaxshi"
                                lesson.overallScore >= 40 -> "O'rtacha"
                                else -> "Yaxshilash kerak"
                            },
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White.copy(alpha = 0.7f)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = lesson.summary.ifEmpty { "Dars tahlili mavjud emas" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.6f),
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Score breakdown
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ScoreChip("Tushunarlilik", lesson.clarityScore, Primary, Modifier.weight(1f))
                    ScoreChip("Jalb qilish", lesson.engagementScore, Accent, Modifier.weight(1f))
                    ScoreChip("Kontent", lesson.contentScore, Emerald600, Modifier.weight(1f))
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Stats row
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.05f))
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${lesson.teacherRatio}%", style = MaterialTheme.typography.titleMedium, color = Primary, fontWeight = FontWeight.Bold)
                            Text("O'qituvchi", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
                        }
                        Box(modifier = Modifier.width(1.dp).height(32.dp).background(Color.White.copy(alpha = 0.1f)))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${lesson.studentRatio}%", style = MaterialTheme.typography.titleMedium, color = Accent, fontWeight = FontWeight.Bold)
                            Text("Talabalar", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
                        }
                        Box(modifier = Modifier.width(1.dp).height(32.dp).background(Color.White.copy(alpha = 0.1f)))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(lesson.formattedDuration ?: "—", style = MaterialTheme.typography.titleMedium, color = Emerald600, fontWeight = FontWeight.Bold)
                            Text("Davomiylik", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Strengths
                if (lesson.strengths.isNotEmpty()) {
                    EvalSection(
                        title = "Kuchli tomonlar",
                        items = lesson.strengths,
                        color = Emerald600
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Improvements
                if (lesson.improvements.isNotEmpty()) {
                    EvalSection(
                        title = "Yaxshilash kerak",
                        items = lesson.improvements,
                        color = Amber700
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Advice
                if (lesson.advice.isNotEmpty()) {
                    EvalSection(
                        title = "Maslahatlar",
                        items = lesson.advice,
                        color = Primary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Transcript
                if (lesson.transcript.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.05f))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Transkripsiya",
                                style = MaterialTheme.typography.titleSmall,
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = lesson.transcript,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.6f),
                                lineHeight = 18.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Done button
                Button(
                    onClick = onBack,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Icon(Icons.Filled.ArrowBack, null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Orqaga", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }

                Spacer(modifier = Modifier.height(48.dp))
            }
        }
    }
}

