package com.eyeziyo.mentor

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.ui.login.LoginScreen
import com.eyeziyo.mentor.ui.shell.MentorShell
import com.eyeziyo.mentor.ui.theme.MentorTheme
import com.eyeziyo.mentor.ui.theme.colors

/**
 * Subclassing FragmentActivity (not ComponentActivity) so BiometricPrompt
 * can attach.
 */
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MentorTheme {
                val tokens = colors()
                Surface(modifier = Modifier.fillMaxSize(), color = tokens.bgCanvas) {
                    AppRoot()
                }
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun AppRoot() {
    val nav = rememberNavController()
    val signedIn by SessionManager.signedIn.collectAsState()
    val start = if (signedIn) "shell" else "login"

    NavHost(navController = nav, startDestination = start) {
        composable("login") {
            LoginScreen(onLoggedIn = {
                nav.navigate("shell") { popUpTo("login") { inclusive = true } }
            })
        }
        composable("shell") {
            MentorShell(onLogout = {
                SessionManager.clear()
                nav.navigate("login") { popUpTo("shell") { inclusive = true } }
            })
        }
    }
}
