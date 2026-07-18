package com.eyeziyo.mentor.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.AchievementsViewModel
import com.eyeziyo.mentor.ui.vm.HomeViewModel

@Composable
fun ProfileScreen(
    onLogout: () -> Unit,
    onOpenAchievements: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val user by SessionManager.user.collectAsState()
    val achievementsVm: AchievementsViewModel = viewModel()
    val achievements by achievementsVm.cards.collectAsState()
    val homeVm: HomeViewModel = viewModel()
    val home by homeVm.ui.collectAsState()
    val c = colors()

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Surface(shape = RoundedCornerShape(20.dp), color = c.primaryLight, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(64.dp).clip(RoundedCornerShape(50)).background(c.primary),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            (user?.avatar ?: user?.name?.take(1) ?: "M").take(1),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 26.sp,
                        )
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(user?.name ?: "—", style = MaterialTheme.typography.titleLarge, color = c.textPrimary)
                        Text(user?.email ?: "", style = MaterialTheme.typography.bodySmall, color = c.textSecondary)
                    }
                }
            }
        }

        if (!user?.groups.isNullOrEmpty()) {
            item {
                Column {
                    Text(stringResource(R.string.profile_groups), style = MaterialTheme.typography.labelMedium, color = c.textSecondary)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        user!!.groups.take(5).forEach { g ->
                            Surface(color = c.bgSurface, shape = RoundedCornerShape(20.dp)) {
                                Text(g, style = MaterialTheme.typography.labelMedium, color = c.primary,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                            }
                        }
                    }
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MiniStat("🔥", (home.streak?.currentStreak ?: 0).toString(), Modifier.weight(1f))
                MiniStat("🏆", achievements.count { it.unlocked }.toString(), Modifier.weight(1f))
                MiniStat("📚", home.lessons.count { it.attempt_score != null }.toString(), Modifier.weight(1f))
            }
        }

        item {
            ProfileMenuItem(Icons.Default.EmojiEvents, stringResource(R.string.profile_achievements), onOpenAchievements)
        }
        item {
            ProfileMenuItem(Icons.Default.Settings, stringResource(R.string.profile_settings), onOpenSettings)
        }
        item {
            ProfileMenuItem(Icons.AutoMirrored.Filled.ExitToApp, stringResource(R.string.profile_logout), onLogout, danger = true)
        }
    }
}

@Composable
private fun MiniStat(emoji: String, value: String, modifier: Modifier) {
    val c = colors()
    Surface(shape = RoundedCornerShape(14.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = modifier) {
        Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(emoji, fontSize = 22.sp)
            Spacer(Modifier.height(2.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, color = c.textPrimary)
        }
    }
}

@Composable
private fun ProfileMenuItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit, danger: Boolean = false) {
    val c = colors()
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = c.bgSurface,
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = if (danger) c.danger else c.primary)
            Spacer(Modifier.width(12.dp))
            Text(label, style = MaterialTheme.typography.titleMedium, color = if (danger) c.danger else c.textPrimary, modifier = Modifier.weight(1f))
            if (!danger) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.textMuted)
        }
    }
}
