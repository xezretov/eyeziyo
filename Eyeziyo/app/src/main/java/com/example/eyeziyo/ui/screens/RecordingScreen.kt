package com.example.eyeziyo.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import android.app.Activity
import com.example.eyeziyo.data.LessonRepository
import com.example.eyeziyo.ui.theme.*
import kotlinx.coroutines.delay
import kotlin.math.sin
import kotlin.random.Random

@Composable
fun RecordingScreen(
    lessonTitle: String = "Yangi dars",
    groupName: String = "",
    topicName: String = "",
    courseType: String = "",
    lessonId: String = "",
    lessonRepository: LessonRepository? = null,
    viewModel: RecordingViewModel = viewModel(),
    onBack: () -> Unit,
    onFinish: () -> Unit
) {
    val context = LocalContext.current
    val isRecording by viewModel.isRecording.collectAsState()
    val isPaused by viewModel.isPaused.collectAsState()
    val elapsedSeconds by viewModel.elapsedSeconds.collectAsState()
    val transcript by viewModel.transcript.collectAsState()
    val rawTranscript by viewModel.rawTranscript.collectAsState()
    val currentStage by viewModel.currentStage.collectAsState()
    val correctionConfidence by viewModel.correctionConfidence.collectAsState()
    val engagementScore by viewModel.engagementScore.collectAsState()
    val teacherRatio by viewModel.teacherRatio.collectAsState()
    val studentRatio by viewModel.studentRatio.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val evaluation by viewModel.evaluation.collectAsState()
    val isEvaluating by viewModel.isEvaluating.collectAsState()

    // Track if recording has been stopped (for showing evaluation UI)
    var recordingStopped by remember { mutableStateOf(false) }

    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }

    // Track if permission was permanently denied
    var showPermissionDeniedDialog by remember { mutableStateOf(false) }
    var permissionPermanentlyDenied by remember { mutableStateOf(false) }

    // Set lesson context (including auth token so the WS upgrade can be verified server-side)
    LaunchedEffect(groupName, topicName) {
        val token = com.example.eyeziyo.data.ApiService.getInstance(context).accessToken
        viewModel.setLessonContext(groupName, topicName, courseType, token)
    }

    // Save evaluation results when received
    LaunchedEffect(evaluation) {
        if (evaluation != null && lessonId.isNotEmpty() && lessonRepository != null) {
            lessonRepository.updateLessonEvaluation(
                lessonId = lessonId,
                overallScore = evaluation!!.overallScore,
                topicScore = evaluation!!.topicScore,
                speechScore = evaluation!!.speechScore,
                methodScore = evaluation!!.methodScore,
                interactionScore = evaluation!!.interactionScore,
                feedbackScore = evaluation!!.feedbackScore,
                summary = evaluation!!.summary,
                strengths = evaluation!!.strengths,
                improvements = evaluation!!.improvements,
                advice = evaluation!!.advice,
                transcript = transcript,
                durationSeconds = elapsedSeconds,
                teacherRatio = teacherRatio,
                studentRatio = studentRatio,
                questionsAsked = transcript.count { it == '?' }
            )
        }
    }

    // Waveform bars data
    var waveformBars by remember { mutableStateOf(List(40) { 0.15f }) }

    // Permission launcher with better handling
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasPermission = granted
        if (!granted) {
            // Check if user permanently denied (Don't ask again)
            val activity = context as? Activity
            if (activity != null) {
                val shouldShowRationale = ActivityCompat.shouldShowRequestPermissionRationale(
                    activity,
                    Manifest.permission.RECORD_AUDIO
                )
                if (!shouldShowRationale) {
                    // User selected "Don't ask again" - need to open settings
                    permissionPermanentlyDenied = true
                }
            }
            showPermissionDeniedDialog = true
        }
    }

    // Settings launcher for opening app settings
    val settingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Check permission again when returning from settings
        hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    LaunchedEffect(isRecording, isPaused) {
        while (isRecording && !isPaused) {
            delay(100)
            waveformBars = List(40) {
                0.1f + Random.nextFloat() * 0.9f
            }
        }
    }

    // Pulse animation for recording indicator
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.3f,
        animationSpec = infiniteRepeatable(
            tween(600, easing = EaseInOutCubic),
            RepeatMode.Reverse
        ),
        label = "pulseScale"
    )
    val outerPulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(
            tween(1000, easing = EaseInOutCubic),
            RepeatMode.Reverse
        ),
        label = "outerPulse"
    )
    val outerPulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            tween(1000, easing = EaseInOutCubic),
            RepeatMode.Reverse
        ),
        label = "outerAlpha"
    )

    // Wave animation for decorative waves
    val wavePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            tween(3000, easing = LinearEasing)
        ),
        label = "wave"
    )

    fun formatTime(seconds: Int): String {
        val min = seconds / 60
        val sec = seconds % 60
        return "%02d:%02d".format(min, sec)
    }

    fun startRecording() {
        viewModel.startRecording()
    }

    fun stopRecording() {
        viewModel.stopRecording()
        recordingStopped = true
    }

    fun pauseRecording() {
        viewModel.pauseRecording()
    }

    fun resumeRecording() {
        viewModel.resumeRecording()
    }

    DisposableEffect(Unit) {
        onDispose {
            if (viewModel.isRecording.value) {
                viewModel.stopRecording()
            }
        }
    }

    // Permission denied dialog
    if (showPermissionDeniedDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionDeniedDialog = false },
            title = { Text("Mikrofon ruxsati kerak") },
            text = {
                Text(
                    if (permissionPermanentlyDenied) {
                        "Darsni yozib olish uchun mikrofon ruxsati kerak. " +
                        "Iltimos, sozlamalarda ruxsat bering."
                    } else {
                        "Darsni yozib olish uchun mikrofon ruxsati kerak. " +
                        "Ruxsatsiz audio yozib bo'lmaydi."
                    }
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showPermissionDeniedDialog = false
                        if (permissionPermanentlyDenied) {
                            // Open app settings
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.fromParts("package", context.packageName, null)
                            }
                            settingsLauncher.launch(intent)
                        } else {
                            // Try asking again
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                ) {
                    Text(if (permissionPermanentlyDenied) "Sozlamalarga o'tish" else "Qayta so'rash")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPermissionDeniedDialog = false }) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    // Show evaluation screen after recording is stopped
    if (recordingStopped && !isRecording) {
        EvaluationScreen(
            evaluation = evaluation,
            isEvaluating = isEvaluating,
            transcript = transcript,
            lessonTitle = lessonTitle,
            onRequestEvaluation = { viewModel.requestEvaluation() },
            onBack = {
                viewModel.disconnect()
                onFinish()
            }
        )
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = if (isRecording && !isPaused) {
                        listOf(Color(0xFF0A2E38), Color(0xFF0E4D5E), Color(0xFF0A2E38))
                    } else {
                        listOf(Gray900, Color(0xFF1A2332), Gray900)
                    }
                )
            )
    ) {
        // Decorative wave background when recording
        if (isRecording && !isPaused) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                for (wave in 0..2) {
                    val amplitude = 20f + wave * 8f
                    val frequency = 0.008f + wave * 0.003f
                    val phase = wavePhase * (1 + wave * 0.3f)
                    val yBase = h * 0.5f + wave * 30f
                    val alpha = 0.06f - wave * 0.015f

                    val path = androidx.compose.ui.graphics.Path()
                    path.moveTo(0f, yBase)
                    for (x in 0..w.toInt() step 2) {
                        val y = yBase + amplitude * sin((x * frequency + Math.toRadians(phase.toDouble())).toFloat())
                        path.lineTo(x.toFloat(), y)
                    }
                    path.lineTo(w, h)
                    path.lineTo(0f, h)
                    path.close()
                    drawPath(path, Primary.copy(alpha = alpha))
                }
            }
        }

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
                IconButton(onClick = {
                    if (isRecording) stopRecording()
                    onBack()
                }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Orqaga", tint = Color.White)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        lessonTitle,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    if (isRecording) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (isPaused) Amber700 else Red500)
                                    .then(
                                        if (!isPaused) Modifier.scale(pulseScale) else Modifier
                                    )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                if (isPaused) "Pauza" else "Yozilmoqda",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isPaused) Amber700 else Red500,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
                // Placeholder for symmetry
                Box(modifier = Modifier.size(48.dp))
            }

            Spacer(modifier = Modifier.weight(1f))

            // Center content
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (!isRecording) {
                    // Not recording state
                    Icon(
                        Icons.Filled.Mic,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = Color.White.copy(alpha = 0.3f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Darsni yozib olish",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Darsni boshlash uchun pastdagi tugmani bosing.\n3 bosqichli AI tizimi nutqingizni tahlil qiladi.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.5f),
                        textAlign = TextAlign.Center,
                        lineHeight = 22.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    // Pipeline info
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color.White.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            PipelineStep("1", "Eyeziyo STT", "Nutqni matnga aylantirish", Primary)
                            Spacer(modifier = Modifier.height(8.dp))
                            PipelineStep("2", "Eyeziyo AI", "Texnik terminlarni tuzatish", Accent)
                            Spacer(modifier = Modifier.height(8.dp))
                            PipelineStep("3", "Eyeziyo Baholash", "Darsni tahlil qilish", Emerald600)
                        }
                    }
                } else {
                    // Recording state — waveform visualization
                    // Timer
                    Text(
                        formatTime(elapsedSeconds),
                        fontSize = 56.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        letterSpacing = 4.sp
                    )

                    Spacer(modifier = Modifier.height(32.dp))

                    // Waveform bars
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp),
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        waveformBars.forEach { height ->
                            val animatedHeight by animateFloatAsState(
                                targetValue = if (isPaused) 0.15f else height,
                                animationSpec = tween(150, easing = EaseInOutCubic),
                                label = "bar"
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight(animatedHeight)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(
                                        Brush.verticalGradient(
                                            colors = listOf(
                                                Primary,
                                                Accent.copy(alpha = 0.6f)
                                            )
                                        )
                                    )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Info badges
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Connection state badge
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color.White.copy(alpha = 0.1f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Filled.Mic, null, modifier = Modifier.size(12.dp), tint = Primary)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(connectionState, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                            }
                        }

                        // Current processing stage badge
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = when (currentStage) {
                                "processing" -> Primary.copy(alpha = 0.3f)
                                "raw" -> Amber700.copy(alpha = 0.3f)
                                "corrected" -> Emerald600.copy(alpha = 0.3f)
                                else -> Color.White.copy(alpha = 0.1f)
                            }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    when (currentStage) {
                                        "processing" -> Icons.Filled.Sync
                                        "raw" -> Icons.Filled.Mic
                                        "corrected" -> Icons.Filled.CheckCircle
                                        else -> Icons.Filled.SmartToy
                                    },
                                    null,
                                    modifier = Modifier.size(12.dp),
                                    tint = when (currentStage) {
                                        "processing" -> Primary
                                        "raw" -> Amber700
                                        "corrected" -> Emerald600
                                        else -> Color.White.copy(alpha = 0.5f)
                                    }
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    when (currentStage) {
                                        "processing" -> "Tahlil..."
                                        "raw" -> "Eyeziyo ✓"
                                        "corrected" -> "Eyeziyo ✓ ${(correctionConfidence * 100).toInt()}%"
                                        else -> "Kutilmoqda"
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White.copy(alpha = 0.7f)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Real-time Stats
                    if (teacherRatio > 0 || studentRatio > 0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Teacher ratio
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                color = Primary.copy(alpha = 0.15f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        "${teacherRatio}%",
                                        fontSize = 20.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Primary
                                    )
                                    Text(
                                        "O'qituvchi",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White.copy(alpha = 0.6f)
                                    )
                                }
                            }

                            // Student ratio
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                color = Accent.copy(alpha = 0.15f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        "${studentRatio}%",
                                        fontSize = 20.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Accent
                                    )
                                    Text(
                                        "Talabalar",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White.copy(alpha = 0.6f)
                                    )
                                }
                            }

                            // Engagement
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                color = Emerald600.copy(alpha = 0.15f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        "$engagementScore",
                                        fontSize = 20.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Emerald600
                                    )
                                    Text(
                                        "Faollik",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White.copy(alpha = 0.6f)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Live Transcript Box (Stage 2 — corrected)
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color.Black.copy(alpha = 0.3f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 120.dp, max = 200.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .padding(16.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Filled.EditNote,
                                        null,
                                        tint = Emerald600,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Tuzatilgan matn",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = Emerald600,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                if (currentStage == "processing") {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(14.dp),
                                        strokeWidth = 2.dp,
                                        color = Primary
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = transcript.ifEmpty { "O'qituvchi gapirishi bilan matn paydo bo'ladi..." },
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.9f),
                                lineHeight = 20.sp
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Bottom controls
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (!isRecording) {
                    // Start button
                    if (!hasPermission) {
                        // Permission needed
                        Button(
                            onClick = {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp)
                                .height(56.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary)
                        ) {
                            Icon(Icons.Filled.Mic, null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Mikrofonga ruxsat", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        }
                    } else {
                        // Pulsing record button
                        Box(contentAlignment = Alignment.Center) {
                            // Outer pulse ring
                            Box(
                                modifier = Modifier
                                    .size(100.dp)
                                    .scale(outerPulseScale)
                                    .clip(CircleShape)
                                    .background(Primary.copy(alpha = outerPulseAlpha * 0.3f))
                            )
                            // Main button
                            FloatingActionButton(
                                onClick = { startRecording() },
                                modifier = Modifier.size(80.dp),
                                shape = CircleShape,
                                containerColor = Primary,
                                contentColor = Color.White,
                                elevation = FloatingActionButtonDefaults.elevation(8.dp)
                            ) {
                                Icon(Icons.Filled.Mic, "Yozishni boshlash", modifier = Modifier.size(36.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            "Darsni boshlash",
                            style = MaterialTheme.typography.titleSmall,
                            color = Color.White.copy(alpha = 0.7f),
                            fontWeight = FontWeight.Medium
                        )
                    }
                } else {
                    // Recording controls
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Pause / Resume
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            FloatingActionButton(
                                onClick = {
                                    if (isPaused) resumeRecording() else pauseRecording()
                                },
                                modifier = Modifier.size(56.dp),
                                shape = CircleShape,
                                containerColor = Color.White.copy(alpha = 0.15f),
                                contentColor = Color.White,
                                elevation = FloatingActionButtonDefaults.elevation(0.dp)
                            ) {
                                Icon(
                                    if (isPaused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                                    if (isPaused) "Davom" else "Pauza",
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }

                        // Stop button (big, red) — disabled for first 60s
                        val minSecondsBeforeStop = 60
                        val canStop = elapsedSeconds >= minSecondsBeforeStop
                        val remainingToStop = (minSecondsBeforeStop - elapsedSeconds).coerceAtLeast(0)
                        Box(contentAlignment = Alignment.Center) {
                            if (!isPaused && canStop) {
                                Box(
                                    modifier = Modifier
                                        .size(100.dp)
                                        .scale(pulseScale)
                                        .clip(CircleShape)
                                        .background(Red500.copy(alpha = 0.15f))
                                )
                            }
                            FloatingActionButton(
                                onClick = {
                                    if (canStop) stopRecording()
                                },
                                modifier = Modifier.size(72.dp),
                                shape = CircleShape,
                                containerColor = if (canStop) Red500 else Gray300,
                                contentColor = Color.White,
                                elevation = FloatingActionButtonDefaults.elevation(
                                    if (canStop) 8.dp else 0.dp
                                )
                            ) {
                                if (canStop) {
                                    Icon(Icons.Filled.Stop, "To'xtatish", modifier = Modifier.size(32.dp))
                                } else {
                                    Text(
                                        "${remainingToStop}s",
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color.White
                                    )
                                }
                            }
                        }

                        // Placeholder for alignment
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            Box(modifier = Modifier.size(56.dp))
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        if (isPaused) "Pauza qilindi" else "Yozishni to'xtatish uchun bosing",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.5f)
                    )
                }
            }
        }
    }
}

@Composable
private fun PipelineStep(number: String, title: String, subtitle: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(
            modifier = Modifier.size(28.dp),
            shape = CircleShape,
            color = color.copy(alpha = 0.2f)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(number, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = color)
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(title, style = MaterialTheme.typography.labelMedium, color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
        }
    }
}
