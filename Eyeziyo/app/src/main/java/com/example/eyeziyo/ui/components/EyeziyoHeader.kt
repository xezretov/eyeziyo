package com.example.eyeziyo.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.User
import com.example.eyeziyo.ui.theme.*

/**
 * Shared header component for all screens.
 *
 * @param user Current logged in user
 * @param title Optional title to show instead of user name
 * @param showBackButton Whether to show back navigation button
 * @param showLogoutButton Whether to show logout button
 * @param showSettingsButton Whether to show settings button
 * @param onBack Callback when back button is pressed
 * @param onLogout Callback when logout button is pressed
 * @param onSettings Callback when settings button is pressed
 * @param actions Additional actions to show on the right side
 */
@Composable
fun EyeziyoHeader(
    user: User?,
    modifier: Modifier = Modifier,
    title: String? = null,
    subtitle: String? = null,
    showBackButton: Boolean = false,
    showLogoutButton: Boolean = false,
    showSettingsButton: Boolean = false,
    onBack: () -> Unit = {},
    onLogout: () -> Unit = {},
    onSettings: () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {}
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = SurfaceLight,
        shadowElevation = 2.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left side: Back button or Avatar
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                if (showBackButton) {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Orqaga",
                            tint = Gray700
                        )
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                }

                if (title != null) {
                    // Show title
                    Column {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        if (subtitle != null) {
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.labelSmall,
                                color = Gray500
                            )
                        }
                    }
                } else if (user != null) {
                    // Show user avatar and name
                    Surface(
                        modifier = Modifier.size(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        color = when (user.role) {
                            "admin" -> Green100
                            else -> Blue100
                        }
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = user.avatar.ifEmpty { user.name.firstOrNull()?.toString() ?: "?" },
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Gray700
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = user.name,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = when (user.role) {
                                "admin" -> "Administrator"
                                else -> user.courseType.ifEmpty { "O'qituvchi" }
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = Gray500
                        )
                    }
                }
            }

            // Right side: Actions
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End
            ) {
                actions()

                if (showSettingsButton) {
                    IconButton(onClick = onSettings) {
                        Icon(
                            Icons.Filled.Settings,
                            contentDescription = "Sozlamalar",
                            tint = Gray600
                        )
                    }
                }

                if (showLogoutButton) {
                    OutlinedButton(
                        onClick = onLogout,
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Logout,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Chiqish", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

/**
 * Simple header with just title and back button.
 */
@Composable
fun SimpleHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: () -> Unit = {}
) {
    EyeziyoHeader(
        user = null,
        modifier = modifier,
        title = title,
        subtitle = subtitle,
        showBackButton = true,
        onBack = onBack
    )
}

/**
 * User header with avatar and logout.
 */
@Composable
fun UserHeader(
    user: User?,
    modifier: Modifier = Modifier,
    showSettings: Boolean = false,
    onLogout: () -> Unit = {},
    onSettings: () -> Unit = {}
) {
    EyeziyoHeader(
        user = user,
        modifier = modifier,
        showLogoutButton = true,
        showSettingsButton = showSettings,
        onLogout = onLogout,
        onSettings = onSettings
    )
}
