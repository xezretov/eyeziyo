package com.eyeziyo.mentor.ui.login

import android.content.Intent
import android.net.Uri
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.AuthApi
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.ui.theme.colors
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoggedIn: () -> Unit) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val c = colors()
    val rememberedEmail = remember { SessionManager.lastEmail() ?: "" }

    var email by remember { mutableStateOf(rememberedEmail) }
    var password by remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showBiometricOffer by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val biometricsAvailable = remember(activity) {
        if (activity == null) false
        else BiometricManager.from(activity).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun launchBiometricUnlock() {
        val act = activity ?: return
        if (!SessionManager.isBiometricEnabled() || !biometricsAvailable) return
        if (SessionManager.accessToken() == null) return
        val executor = ContextCompat.getMainExecutor(act)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onLoggedIn()
            }
        }
        BiometricPrompt(act, executor, callback).authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(act.getString(R.string.login_biometric_prompt))
                .setSubtitle(act.getString(R.string.login_biometric_subtitle))
                .setNegativeButtonText(act.getString(R.string.login_biometric_negative))
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .build()
        )
    }

    LaunchedEffect(Unit) { launchBiometricUnlock() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(c.primaryLight, c.bgCanvas))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = stringResource(R.string.login_title),
                style = MaterialTheme.typography.displayMedium,
                color = c.primary,
            )
            Text(
                text = stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = c.textSecondary,
            )
            Spacer(Modifier.height(8.dp))

            Surface(
                shape = RoundedCornerShape(20.dp),
                color = c.bgSurface,
                shadowElevation = 4.dp,
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text(stringResource(R.string.login_email)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.login_password)) },
                        singleLine = true,
                        visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showPw = !showPw }) {
                                Icon(
                                    if (showPw) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null,
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (error != null) {
                        Text(error!!, color = c.danger, style = MaterialTheme.typography.bodySmall)
                    }

                    Button(
                        onClick = {
                            if (loading) return@Button
                            error = null
                            loading = true
                            scope.launch {
                                runCatching {
                                    val token = AuthApi.login(email.trim(), password)
                                    SessionManager.setTokens(token.access_token, token.refresh_token, token.expires_in)
                                    val me = AuthApi.me()
                                    if (me.role != "student") {
                                        SessionManager.clear()
                                        error = context.getString(R.string.login_only_students)
                                        loading = false
                                        return@runCatching
                                    }
                                    SessionManager.setUser(me)
                                    if (biometricsAvailable && !SessionManager.isBiometricEnabled()) {
                                        showBiometricOffer = true
                                        loading = false
                                    } else {
                                        loading = false
                                        onLoggedIn()
                                    }
                                }.onFailure {
                                    error = it.message ?: "Xatolik"
                                    loading = false
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                    ) {
                        if (loading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(22.dp),
                            )
                        } else {
                            Text(stringResource(R.string.login_button), style = MaterialTheme.typography.titleMedium)
                        }
                    }

                    if (biometricsAvailable && SessionManager.isBiometricEnabled() && SessionManager.accessToken() != null) {
                        OutlinedButton(
                            onClick = { launchBiometricUnlock() },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.Fingerprint, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text(stringResource(R.string.login_biometric_prompt))
                        }
                    }

                    TextButton(
                        onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:support@eyeziyo.uz?subject=Parol%20tiklash")
                            }
                            runCatching { context.startActivity(intent) }
                        },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        Text(stringResource(R.string.login_forgot), color = c.primary)
                    }
                }
            }

            Text(
                stringResource(R.string.login_hint),
                style = MaterialTheme.typography.bodySmall,
                color = c.textMuted,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }

    if (showBiometricOffer) {
        AlertDialog(
            onDismissRequest = { showBiometricOffer = false; onLoggedIn() },
            title = { Text(stringResource(R.string.settings_biometric)) },
            text = { Text(stringResource(R.string.login_biometric_offer)) },
            confirmButton = {
                TextButton(onClick = {
                    SessionManager.setBiometricEnabled(true)
                    showBiometricOffer = false
                    onLoggedIn()
                }) { Text(stringResource(R.string.common_yes)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    showBiometricOffer = false
                    onLoggedIn()
                }) { Text(stringResource(R.string.common_no)) }
            },
        )
    }
}
