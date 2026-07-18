package com.eyeziyo.mentor.ui.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.ui.chat.ChatScreen
import com.eyeziyo.mentor.ui.daily.DailyPracticeScreen
import com.eyeziyo.mentor.ui.flashcards.FlashcardsScreen
import com.eyeziyo.mentor.ui.home.HomeScreen
import com.eyeziyo.mentor.ui.lessons.EvaluationScreen
import com.eyeziyo.mentor.ui.lessons.LessonOverviewScreen
import com.eyeziyo.mentor.ui.lessons.LessonsScreen
import com.eyeziyo.mentor.ui.lessons.TermsScreen
import com.eyeziyo.mentor.ui.lessons.TestScreen
import com.eyeziyo.mentor.ui.profile.AchievementsScreen
import com.eyeziyo.mentor.ui.profile.ProfileScreen
import com.eyeziyo.mentor.ui.profile.SettingsScreen
import com.eyeziyo.mentor.ui.stats.StatsScreen
import com.eyeziyo.mentor.ui.theme.colors

/**
 * Top-level shell:
 *  - 5 root tabs (Home / Lessons / Practice / Stats / Profile)
 *  - Each tab is its own NavGraph branch so back-stack is per-tab.
 *  - System back routes to home when not at home; otherwise default behavior.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MentorShell(onLogout: () -> Unit) {
    val nav = rememberNavController()
    val backEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backEntry?.destination?.route

    val tabs = remember {
        listOf(
            ShellTab("home",     R.string.tab_home,     Icons.Outlined.Home,        Icons.Outlined.HomeMax),
            ShellTab("lessons",  R.string.tab_lessons,  Icons.AutoMirrored.Outlined.MenuBook,    Icons.AutoMirrored.Outlined.MenuBook),
            ShellTab("practice", R.string.tab_practice, Icons.Outlined.FlashOn,     Icons.Outlined.FlashOn),
            ShellTab("stats",    R.string.tab_stats,    Icons.Outlined.BarChart,    Icons.Outlined.BarChart),
            ShellTab("profile",  R.string.tab_profile,  Icons.Outlined.Person,      Icons.Outlined.Person),
        )
    }
    val showBottomBar = currentRoute in tabs.map { it.route }

    val c = colors()

    Scaffold(
        containerColor = c.bgCanvas,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = c.bgSurface) {
                    tabs.forEach { tab ->
                        val selected = backEntry?.destination?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(if (selected) tab.activeIcon else tab.icon, contentDescription = null) },
                            label = { Text(stringResource(tab.label)) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = c.primary,
                                selectedTextColor = c.primary,
                                indicatorColor = c.primaryLight,
                                unselectedIconColor = c.textMuted,
                                unselectedTextColor = c.textMuted,
                            ),
                        )
                    }
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding)) {
            NavHost(navController = nav, startDestination = "home") {
                composable("home") {
                    HomeScreen(
                        onOpenLesson = { id -> nav.navigate("lesson/$id") },
                        onOpenPractice = { nav.navigate("practice") },
                        onOpenFlashcards = { nav.navigate("practice/flashcards") },
                        onOpenEvaluation = { id -> nav.navigate("lesson/$id/evaluation") },
                    )
                }
                composable("lessons") {
                    LessonsScreen(onOpenLesson = { id -> nav.navigate("lesson/$id") })
                }
                composable("practice") {
                    DailyPracticeScreen(onOpenFlashcards = { nav.navigate("practice/flashcards") })
                }
                composable("stats") { StatsScreen() }
                composable("profile") {
                    ProfileScreen(
                        onLogout = onLogout,
                        onOpenAchievements = { nav.navigate("profile/achievements") },
                        onOpenSettings = { nav.navigate("profile/settings") },
                    )
                }

                composable("lesson/{id}") { entry ->
                    val id = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    LessonOverviewScreen(
                        lessonId = id,
                        onBack = { nav.popBackStack() },
                        onStartTest = { nav.navigate("lesson/$id/test") },
                        onOpenTerms = { nav.navigate("lesson/$id/terms") },
                        onOpenChat = { nav.navigate("lesson/$id/chat") },
                        onOpenFlashcards = { nav.navigate("practice/flashcards") },
                    )
                }
                composable("lesson/{id}/test") { entry ->
                    val id = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    TestScreen(
                        lessonId = id,
                        onBack = { nav.popBackStack() },
                        onFinished = {
                            // Test → ratings (admin questions) → terms
                            nav.navigate("lesson/$id/evaluation") {
                                popUpTo("lesson/$id/test") { inclusive = true }
                            }
                        },
                    )
                }
                composable("lesson/{id}/evaluation") { entry ->
                    val id = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    EvaluationScreen(
                        lessonId = id,
                        onBack = { nav.popBackStack() },
                        onSubmitted = {
                            nav.navigate("lesson/$id/terms") {
                                popUpTo("lesson/$id/evaluation") { inclusive = true }
                            }
                        },
                    )
                }
                composable("lesson/{id}/terms") { entry ->
                    val id = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    TermsScreen(
                        lessonId = id,
                        onBack = { nav.popBackStack() },
                        onOpenChat = { nav.navigate("lesson/$id/chat") },
                        onOpenFlashcards = { nav.navigate("practice/flashcards") },
                    )
                }
                composable("lesson/{id}/chat") { entry ->
                    val id = entry.arguments?.getString("id")?.toIntOrNull() ?: 0
                    ChatScreen(lessonId = id, onBack = { nav.popBackStack() })
                }
                composable("practice/flashcards") {
                    FlashcardsScreen(onBack = { nav.popBackStack() })
                }
                composable("profile/settings") {
                    SettingsScreen(onBack = { nav.popBackStack() })
                }
                composable("profile/achievements") {
                    AchievementsScreen(onBack = { nav.popBackStack() })
                }
            }
        }
    }
}

private data class ShellTab(
    val route: String,
    val label: Int,
    val icon: ImageVector,
    val activeIcon: ImageVector,
)
