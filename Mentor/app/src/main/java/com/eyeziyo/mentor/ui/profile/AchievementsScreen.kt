package com.eyeziyo.mentor.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.AchievementCardUi
import com.eyeziyo.mentor.ui.vm.AchievementsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AchievementsScreen(onBack: () -> Unit) {
    val vm: AchievementsViewModel = viewModel()
    val cards by vm.cards.collectAsState()
    val c = colors()

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ach_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        }
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(cards) { card -> AchievementCard(card) }
        }
    }
}

@Composable
private fun AchievementCard(card: AchievementCardUi) {
    val c = colors()
    val unlocked = card.unlocked
    val tint: Color = if (unlocked) card.def.tier.color else c.textMuted
    val bg = if (unlocked) tint.copy(alpha = 0.10f) else c.bgSurface

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = bg,
        shadowElevation = if (unlocked) 0.dp else 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier.padding(14.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (unlocked) tint.copy(alpha = 0.18f) else c.border),
                contentAlignment = Alignment.Center,
            ) {
                Text(card.def.emoji, fontSize = 26.sp)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                card.def.title,
                style = MaterialTheme.typography.titleSmall,
                color = if (unlocked) c.textPrimary else c.textSecondary,
                textAlign = TextAlign.Center,
            )
            Text(
                card.def.subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = c.textMuted,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            if (unlocked) {
                Text(stringResource(R.string.ach_unlocked), style = MaterialTheme.typography.labelMedium, color = tint)
            } else {
                LinearProgressIndicator(
                    progress = { card.progress.toFloat() / card.def.target.toFloat() },
                    color = tint,
                    trackColor = c.border,
                    modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(4.dp)),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.ach_progress, card.progress, card.def.target),
                    style = MaterialTheme.typography.labelSmall,
                    color = c.textMuted,
                )
            }
        }
    }
}
