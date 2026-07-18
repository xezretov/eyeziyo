package com.example.eyeziyo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.toRoute
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.eyeziyo.data.AuthViewModel
import com.example.eyeziyo.data.LessonRepository
import com.example.eyeziyo.data.ServerConfig
import com.example.eyeziyo.data.StoredLesson
import com.example.eyeziyo.ui.screens.*
import com.example.eyeziyo.ui.theme.EyeziyoTheme
import com.example.eyeziyo.ui.theme.Gray400
import com.example.eyeziyo.ui.theme.Primary
import com.example.eyeziyo.ui.theme.SurfaceLight
import kotlinx.serialization.Serializable

// Navigation routes
@Serializable object LoginRoute
@Serializable object TeacherHomeRoute
@Serializable object TeacherLessonsRoute
@Serializable object TeacherReportsRoute
@Serializable object TeacherSettingsRoute
@Serializable data class RecordingRoute(val groupName: String, val topicName: String, val lessonId: String = "")
@Serializable data class LessonDetailRoute(val lessonId: String)
@Serializable object AdminRoute
@Serializable data class TeacherDetailRoute(val teacherId: Int)

data class TeacherTab(
    val route: Any,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Load saved server settings (ngrok domain, local host/port)
        ServerConfig.initialize(applicationContext)

        setContent {
            EyeziyoTheme {
                EyeziyoApp()
            }
        }
    }
}

@Composable
fun EyeziyoApp(authViewModel: AuthViewModel = viewModel()) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val context = androidx.compose.ui.platform.LocalContext.current

    // Lesson repository for data persistence
    val lessonRepository = remember { LessonRepository.getInstance(context) }
    val apiService = remember { com.example.eyeziyo.data.ApiService.getInstance(context) }

    // Observable state for lessons (refreshes when navigating)
    var lessons by remember { mutableStateOf(lessonRepository.getAllLessons()) }
    var homeStats by remember { mutableStateOf(lessonRepository.getHomeStats()) }
    var lastLesson by remember { mutableStateOf(lessonRepository.getLastLesson()) }

    // Pull lessons from server whenever we return to home/lessons screens.
    // Server is the source of truth so the user sees their full history even
    // after reinstalling the app or switching devices.
    LaunchedEffect(currentDestination) {
        if (currentDestination?.hasRoute(TeacherHomeRoute::class) == true ||
            currentDestination?.hasRoute(TeacherLessonsRoute::class) == true) {
            // Best-effort sync; if it fails (offline) we still show local cache
            if (authViewModel.user != null) {
                lessonRepository.syncFromServer(apiService)
            }
            lessons = lessonRepository.getAllLessons()
            homeStats = lessonRepository.getHomeStats()
            lastLesson = lessonRepository.getLastLesson()
        }
    }

    val teacherTabs = remember {
        listOf(
            TeacherTab(TeacherHomeRoute, "Bosh sahifa", Icons.Filled.Dashboard, Icons.Outlined.Dashboard),
            TeacherTab(TeacherLessonsRoute, "Darslar", Icons.Filled.MenuBook, Icons.Outlined.MenuBook),
            TeacherTab(TeacherReportsRoute, "Hisobotlar", Icons.Filled.BarChart, Icons.Outlined.BarChart),
            TeacherTab(TeacherSettingsRoute, "Sozlamalar", Icons.Filled.Settings, Icons.Outlined.Settings),
        )
    }

    // Show bottom nav only on teacher screens
    val showBottomBar = currentDestination?.let { dest ->
        teacherTabs.any { tab -> dest.hasRoute(tab.route::class) }
    } ?: false

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                NavigationBar(
                    containerColor = SurfaceLight,
                    tonalElevation = 0.dp
                ) {
                    teacherTabs.forEach { tab ->
                        val selected = currentDestination?.hasRoute(tab.route::class) == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(TeacherHomeRoute) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    if (selected) tab.selectedIcon else tab.unselectedIcon,
                                    contentDescription = tab.label
                                )
                            },
                            label = {
                                Text(
                                    tab.label,
                                    fontSize = 10.sp,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Primary,
                                selectedTextColor = Primary,
                                unselectedIconColor = Gray400,
                                unselectedTextColor = Gray400,
                                indicatorColor = Primary.copy(alpha = 0.1f)
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = LoginRoute,
            modifier = Modifier.padding(
                bottom = if (showBottomBar) innerPadding.calculateBottomPadding() else 0.dp
            )
        ) {
            composable<LoginRoute> {
                LoginScreen(
                    authViewModel = authViewModel,
                    onLoginSuccess = { role ->
                        val route = if (role == "teacher") TeacherHomeRoute else AdminRoute
                        navController.navigate(route) {
                            popUpTo(LoginRoute) { inclusive = true }
                        }
                    }
                )
            }

            composable<TeacherHomeRoute> {
                val userGroups = authViewModel.user?.groups?.map { "$it - ${authViewModel.user?.courseType}" } ?: emptyList()
                HomeScreen(
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(LoginRoute) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onStartRecording = { group, topic ->
                        // Create a new lesson record
                        val newLesson = lessonRepository.saveLesson(
                            StoredLesson(
                                groupName = group.split(" - ").firstOrNull() ?: group,
                                topicName = topic,
                                courseType = authViewModel.user?.courseType ?: ""
                            )
                        )
                        navController.navigate(RecordingRoute(
                            groupName = newLesson.groupName,
                            topicName = newLesson.topicName,
                            lessonId = newLesson.id
                        ))
                    },
                    onViewLesson = { lessonId ->
                        navController.navigate(LessonDetailRoute(lessonId))
                    },
                    groups = userGroups,
                    stats = homeStats,
                    lastLesson = lastLesson
                )
            }

            composable<TeacherLessonsRoute> {
                LessonsScreen(
                    onStartRecording = {
                        val newLesson = lessonRepository.saveLesson(
                            StoredLesson(
                                groupName = authViewModel.user?.groups?.firstOrNull() ?: "Guruh",
                                topicName = "Yangi dars",
                                courseType = authViewModel.user?.courseType ?: ""
                            )
                        )
                        navController.navigate(RecordingRoute(
                            groupName = newLesson.groupName,
                            topicName = newLesson.topicName,
                            lessonId = newLesson.id
                        ))
                    },
                    onViewLesson = { lessonId ->
                        navController.navigate(LessonDetailRoute(lessonId))
                    },
                    lessons = lessons
                )
            }

            composable<RecordingRoute> { backStackEntry ->
                val args = backStackEntry.toRoute<RecordingRoute>()
                val userCourseType = authViewModel.user?.courseType ?: ""
                RecordingScreen(
                    lessonTitle = "${args.groupName}: ${args.topicName}",
                    groupName = args.groupName,
                    topicName = args.topicName,
                    courseType = userCourseType,
                    lessonId = args.lessonId,
                    lessonRepository = lessonRepository,
                    onBack = { navController.popBackStack() },
                    onFinish = {
                        // Refresh data after recording
                        lessons = lessonRepository.getAllLessons()
                        homeStats = lessonRepository.getHomeStats()
                        lastLesson = lessonRepository.getLastLesson()
                        navController.popBackStack()
                    }
                )
            }

            composable<LessonDetailRoute> { backStackEntry ->
                val args = backStackEntry.toRoute<LessonDetailRoute>()
                val lesson = lessonRepository.getLessonById(args.lessonId)
                if (lesson != null) {
                    LessonDetailScreen(
                        lesson = lesson,
                        onBack = { navController.popBackStack() }
                    )
                }
            }

            composable<TeacherReportsRoute> {
                ReportsScreen(lessons = lessons)
            }

            composable<TeacherSettingsRoute> {
                SettingsScreen(
                    user = authViewModel.user,
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(LoginRoute) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            composable<AdminRoute> {
                AdminScreen(
                    user = authViewModel.user,
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(LoginRoute) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onTeacherClick = { teacherId ->
                        navController.navigate(TeacherDetailRoute(teacherId))
                    }
                )
            }

            composable<TeacherDetailRoute> { backStackEntry ->
                val args = backStackEntry.toRoute<TeacherDetailRoute>()
                TeacherDetailScreen(
                    teacherId = args.teacherId,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}