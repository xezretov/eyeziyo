package com.example.eyeziyo.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RemoveRedEye
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.AuthViewModel
import com.example.eyeziyo.ui.components.PrimaryActionButton
import com.example.eyeziyo.ui.theme.*

@Composable
fun LoginScreen(
    authViewModel: AuthViewModel,
    onLoginSuccess: (String) -> Unit
) {
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    LaunchedEffect(Unit) {
        authViewModel.initialize(context)
        authViewModel.user?.let { onLoginSuccess(it.role) }
    }

    // Soft animated background blobs
    val t = rememberInfiniteTransition(label = "bg")
    val off1 by t.animateFloat(
        0f, 24f,
        animationSpec = infiniteRepeatable(tween(4200, easing = EaseInOutCubic), RepeatMode.Reverse),
        label = "o1"
    )
    val off2 by t.animateFloat(
        0f, -18f,
        animationSpec = infiniteRepeatable(tween(5400, easing = EaseInOutCubic), RepeatMode.Reverse),
        label = "o2"
    )

    fun doLogin() {
        if (email.isEmpty() || password.isEmpty()) {
            error = "Email va parolni kiriting"
            return
        }
        loading = true
        error = ""
        authViewModel.loginAsync(email.trim(), password) { result ->
            loading = false
            if (result.isSuccess) {
                onLoginSuccess(authViewModel.user?.role ?: "teacher")
            } else {
                error = result.exceptionOrNull()?.message ?: "Login yoki parol noto'g'ri"
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
    ) {
        // Soft color blobs
        Box(
            modifier = Modifier
                .offset(x = (-80 + off1).dp, y = (-100 + off1).dp)
                .size(320.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(listOf(Primary.copy(alpha = 0.16f), Color.Transparent))
                )
                .align(Alignment.TopEnd)
        )
        Box(
            modifier = Modifier
                .offset(x = (-60 + off2).dp, y = (off2).dp)
                .size(260.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(listOf(Violet.copy(alpha = 0.14f), Color.Transparent))
                )
                .align(Alignment.BottomStart)
        )
        Box(
            modifier = Modifier
                .offset(x = (off1).dp, y = (-off2).dp)
                .size(180.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(listOf(Sunny.copy(alpha = 0.12f), Color.Transparent))
                )
                .align(Alignment.CenterEnd)
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .statusBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Brand
            Surface(
                modifier = Modifier.size(96.dp),
                shape = RoundedCornerShape(28.dp),
                color = Color.White,
                shadowElevation = 12.dp
            ) {
                Box(contentAlignment = Alignment.Center) {
                    androidx.compose.foundation.Image(
                        painter = androidx.compose.ui.res.painterResource(
                            id = com.example.eyeziyo.R.drawable.logo_eyeziyo
                        ),
                        contentDescription = "Eyeziyo logo",
                        modifier = Modifier.size(74.dp)
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
            Text(
                "Eyeziyo",
                fontSize = 36.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Ink900
            )
            Text(
                "AI darslar tahlili",
                fontSize = 14.sp,
                color = Ink500,
                fontWeight = FontWeight.Medium
            )

            Spacer(Modifier.height(36.dp))

            // Login card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Text(
                        "Xush kelibsiz",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900
                    )
                    Text(
                        "Davom etish uchun tizimga kiring",
                        fontSize = 13.sp,
                        color = Ink500
                    )

                    Spacer(Modifier.height(20.dp))

                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; error = "" },
                        label = { Text("Email") },
                        leadingIcon = { Icon(Icons.Filled.Email, null, tint = Ink400) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Primary,
                            focusedLabelColor = Primary,
                            unfocusedBorderColor = Ink200,
                            focusedContainerColor = Ink50,
                            unfocusedContainerColor = Ink50
                        )
                    )

                    Spacer(Modifier.height(12.dp))

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = "" },
                        label = { Text("Parol") },
                        leadingIcon = { Icon(Icons.Filled.Lock, null, tint = Ink400) },
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = if (passwordVisible) "Parolni yashirish" else "Parolni ko'rsatish",
                                    tint = Ink400
                                )
                            }
                        },
                        visualTransformation = if (passwordVisible)
                            androidx.compose.ui.text.input.VisualTransformation.None
                        else
                            PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { focusManager.clearFocus(); doLogin() }
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Primary,
                            focusedLabelColor = Primary,
                            unfocusedBorderColor = Ink200,
                            focusedContainerColor = Ink50,
                            unfocusedContainerColor = Ink50
                        )
                    )

                    if (error.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            color = DangerBg
                        ) {
                            Text(
                                error,
                                modifier = Modifier.padding(14.dp),
                                color = DangerDark,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Spacer(Modifier.height(20.dp))

                    PrimaryActionButton(
                        text = if (loading) "Kirilmoqda..." else "Kirish",
                        icon = null,
                        onClick = { doLogin() },
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth()
                    )

                }
            }

            Spacer(Modifier.height(24.dp))
            Text(
                "© 2026 Eyeziyo · AI Education",
                fontSize = 11.sp,
                color = Ink400,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun QuickFillRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    email: String,
    badgeBg: Color,
    badgeFg: Color,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Ink50,
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = RoundedCornerShape(12.dp),
                color = badgeBg
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = badgeFg, modifier = Modifier.size(20.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink900
                )
                Text(
                    email,
                    fontSize = 11.sp,
                    color = Ink500
                )
            }
        }
    }
}
