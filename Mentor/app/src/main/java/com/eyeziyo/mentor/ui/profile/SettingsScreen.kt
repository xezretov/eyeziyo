package com.eyeziyo.mentor.ui.profile

import androidx.biometric.BiometricManager
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.prefs.AppLanguage
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.prefs.SettingsStore
import com.eyeziyo.mentor.data.prefs.ThemeMode
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.util.LocaleApplier

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val c = colors()
    val theme by SettingsStore.theme.collectAsState()
    val lang by SettingsStore.language.collectAsState()
    val notifStreak by SettingsStore.notifStreak.collectAsState()
    val notifReview by SettingsStore.notifReview.collectAsState()

    val biometricsAvailable = remember {
        BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS
    }
    var biometric by remember { mutableStateOf(SessionManager.isBiometricEnabled()) }

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        }
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionCard(title = stringResource(R.string.settings_theme)) {
                SegmentedRow(
                    selected = theme.ordinal,
                    options = listOf(
                        stringResource(R.string.settings_theme_system),
                        stringResource(R.string.settings_theme_light),
                        stringResource(R.string.settings_theme_dark),
                    ),
                    onSelect = { idx -> SettingsStore.setTheme(ThemeMode.values()[idx]) },
                )
            }
            SectionCard(title = stringResource(R.string.settings_language)) {
                LanguageRow(current = lang, label = "System", target = AppLanguage.System) {
                    SettingsStore.setLanguage(it); LocaleApplier.apply(context, it)
                }
                LanguageRow(current = lang, label = "O'zbek", target = AppLanguage.Uz) {
                    SettingsStore.setLanguage(it); LocaleApplier.apply(context, it)
                }
                LanguageRow(current = lang, label = "Русский", target = AppLanguage.Ru) {
                    SettingsStore.setLanguage(it); LocaleApplier.apply(context, it)
                }
                LanguageRow(current = lang, label = "English", target = AppLanguage.En) {
                    SettingsStore.setLanguage(it); LocaleApplier.apply(context, it)
                }
            }

            SectionCard(title = stringResource(R.string.settings_notifications)) {
                SwitchRow(stringResource(R.string.settings_notif_streak), notifStreak, SettingsStore::setNotifStreak)
                SwitchRow(stringResource(R.string.settings_notif_review), notifReview, SettingsStore::setNotifReview)
            }

            if (biometricsAvailable) {
                SectionCard(title = stringResource(R.string.settings_biometric)) {
                    SwitchRow(stringResource(R.string.settings_biometric), biometric) {
                        biometric = it
                        SessionManager.setBiometricEnabled(it)
                    }
                }
            }

            SectionCard(title = stringResource(R.string.settings_about)) {
                Text(
                    stringResource(R.string.settings_version, "2.0"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    val c = colors()
    Surface(shape = RoundedCornerShape(14.dp), color = c.bgSurface, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = c.textSecondary)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun SegmentedRow(selected: Int, options: List<String>, onSelect: (Int) -> Unit) {
    val c = colors()
    Row {
        options.forEachIndexed { i, opt ->
            val isSel = i == selected
            Surface(
                color = if (isSel) c.primary else c.bgCanvas,
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier
                    .padding(end = 6.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .clickable { onSelect(i) },
            ) {
                Text(
                    opt,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isSel) Color.White else c.textSecondary,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun LanguageRow(current: AppLanguage, label: String, target: AppLanguage, onPick: (AppLanguage) -> Unit) {
    val c = colors()
    Row(
        Modifier.fillMaxWidth().clickable { onPick(target) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = c.textPrimary)
        RadioButton(selected = current == target, onClick = { onPick(target) })
    }
}

@Composable
private fun SwitchRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val c = colors()
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = c.textPrimary)
        Switch(checked = value, onCheckedChange = onChange)
    }
}
