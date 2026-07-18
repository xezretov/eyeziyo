package com.example.eyeziyo.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eyeziyo.data.User
import com.example.eyeziyo.ui.components.*
import com.example.eyeziyo.ui.theme.*

private data class SettingItem(
    val icon: ImageVector,
    val label: String,
    val desc: String,
    val bg: Color,
    val tint: Color
)

@Composable
fun SettingsScreen(user: User?, onLogout: () -> Unit) {
    val scrollState = rememberScrollState()
    val context = androidx.compose.ui.platform.LocalContext.current

    var showHelp by remember { mutableStateOf(false) }

    val settings = remember {
        listOf(
            SettingItem(Icons.Filled.Person, "Profil", "Ism, telefon, email", PrimaryBg, Primary),
            SettingItem(Icons.Filled.Share, "Ilovani ulashish", "APK faylni do'stlarga jo'natish", PrimaryBg, Primary),
            SettingItem(Icons.AutoMirrored.Filled.Help, "Yordam markazi", "Ilova qo'llanmasi", MintBg, Mint),
            SettingItem(Icons.Filled.Info, "Ilova haqida", "Versiya · 2.0.0", SunnyBg, WarningDark),
        )
    }

    if (showHelp) {
        HelpScreen(onBack = { showHelp = false })
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .verticalScroll(scrollState)
    ) {
        // ── Hero with profile
        HeroCard(background = Primary) {
            Text(
                "Sozlamalar",
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White
            )
            Text(
                "Profil va ilova",
                fontSize = 12.sp,
                color = Color.White.copy(alpha = 0.85f)
            )
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg)
        ) {
            // ── Profile card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        modifier = Modifier.size(84.dp),
                        shape = CircleShape,
                        color = PrimaryBg
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            val initials = user?.avatar?.takeIf { it.isNotEmpty() }
                                ?: user?.name?.take(1)?.uppercase()
                                ?: "U"
                            Text(
                                initials,
                                fontSize = 32.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Primary
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        user?.name ?: "Foydalanuvchi",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Ink900
                    )
                    Text(
                        user?.email ?: "",
                        fontSize = 12.sp,
                        color = Ink500
                    )
                    Spacer(Modifier.height(12.dp))
                    Pill(
                        text = if (user?.role == "admin") "Administrator" else "O'qituvchi",
                        background = if (user?.role == "admin") VioletBg else PrimaryBg,
                        textColor = if (user?.role == "admin") Violet else Primary,
                        icon = Icons.Filled.Verified
                    )
                }
            }

            Spacer(Modifier.height(Spacing.lg))

            // ── Settings list
            SectionHeader("Sozlamalar")
            Spacer(Modifier.height(Spacing.md))

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                settings.forEach { item ->
                    SettingRow(item) {
                        when (item.label) {
                            "Ilovani ulashish" ->
                                com.example.eyeziyo.util.AppShare.shareInstalledApk(context)
                            "Yordam markazi" ->
                                showHelp = true
                        }
                    }
                }
            }

            Spacer(Modifier.height(Spacing.xl))

            // ── Logout
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = Surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                onClick = onLogout
            ) {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconBadge(
                        icon = Icons.AutoMirrored.Filled.Logout,
                        tint = Danger,
                        background = DangerBg
                    )
                    Spacer(Modifier.width(14.dp))
                    Text(
                        "Tizimdan chiqish",
                        modifier = Modifier.weight(1f),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Danger
                    )
                }
            }

            Spacer(Modifier.height(120.dp))
        }
    }
}

@Composable
private fun SettingRow(item: SettingItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(icon = item.icon, tint = item.tint, background = item.bg)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.label,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink900
                )
                Text(
                    item.desc,
                    fontSize = 12.sp,
                    color = Ink500
                )
            }
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                null,
                modifier = Modifier.size(14.dp),
                tint = Ink300
            )
        }
    }
}

@Composable
private fun HelpScreen(onBack: () -> Unit) {
    val scrollState = rememberScrollState()

    data class HelpItem(
        val icon: androidx.compose.ui.graphics.vector.ImageVector,
        val title: String,
        val body: String,
        val bg: androidx.compose.ui.graphics.Color,
        val tint: androidx.compose.ui.graphics.Color,
    )

    val items = listOf(
        HelpItem(
            Icons.Filled.Mic, "Dars yozish",
            "Bosh sahifada \"Darsni boshlash\" tugmasini bosing. Guruh va mavzuni tanlang. Eyeziyo sizning nutqingizni real vaqtda matnga aylantiradi. Dars davomida ekranda transkript ko'rinib turadi.",
            CoralBg, Coral,
        ),
        HelpItem(
            Icons.Filled.Timer, "Dars davomiyligi",
            "Minimal dars davomiyligi 60 soniya. Stop tugmasi 60 soniyadan keyin faollashadi. Countdown ekranda ko'rinadi. Dars uzunroq bo'lsa — tahlil aniqroq bo'ladi.",
            SunnyBg, WarningDark,
        ),
        HelpItem(
            Icons.Filled.Assessment, "Tahlil va baholash",
            "Dars tugagach Eyeziyo avtomatik tahlil qiladi: umumiy ball (0-100), tushunarlilik, jalb qilish va kontent sifati. Har bir ko'rsatkich alohida baholanadi. Kuchli tomonlar, yaxshilash kerak bo'lgan joylar va maslahatlar beriladi.",
            MintBg, Mint,
        ),
        HelpItem(
            Icons.Filled.MenuBook, "Darslar tarixi",
            "Pastdagi \"Darslar\" tabida barcha yozilgan darslar ro'yxati ko'rinadi. Har bir darsni bosib batafsil tahlilni ko'rishingiz mumkin. Darslar serverda saqlanadi — telefon almashtirsangiz ham yo'qolmaydi.",
            VioletBg, Violet,
        ),
        HelpItem(
            Icons.Filled.BarChart, "Hisobotlar",
            "\"Hisobotlar\" tabida haftalik statistika, grafik va ko'nikmalar tahlili ko'rsatiladi. Tushunarlilik, jalb qilish va kontent sifati bo'yicha progress kuzatiladi. Ulashish tugmasi orqali hisobotni Telegram/WhatsApp'ga jo'natish mumkin.",
            PrimaryBg, Primary,
        ),
        HelpItem(
            Icons.Filled.RecordVoiceOver, "Ovoz sifati",
            "Yaxshi natija uchun: telefonni og'zingizdan 20-30 sm uzoqda tuting, shovqinsiz muhitda gapiring, aniq va o'rtacha tezlikda so'zlang. Texnik terminlarni (PHP, MySQL, JavaScript) asl holida talaffuz qiling.",
            PeachBg, Peach,
        ),
        HelpItem(
            Icons.Filled.Share, "Ilovani ulashish",
            "Sozlamalar → \"Ilovani ulashish\" orqali APK faylni hamkasblaringizga Telegram, WhatsApp yoki Bluetooth orqali jo'natishingiz mumkin.",
            PrimaryBg, Primary,
        ),
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Canvas)
            .verticalScroll(scrollState)
    ) {
        HeroCard(background = Mint) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.22f),
                    onClick = onBack
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            "Orqaga",
                            tint = Color.White
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        "Yordam markazi",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White
                    )
                    Text(
                        "Eyeziyo qo'llanmasi",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
            }
        }

        Spacer(Modifier.height(Spacing.lg))

        Column(modifier = Modifier.padding(horizontal = Spacing.lg)) {
            items.forEach { item ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(18.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Surface(
                            modifier = Modifier.size(44.dp),
                            shape = RoundedCornerShape(14.dp),
                            color = item.bg
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(item.icon, null, tint = item.tint, modifier = Modifier.size(22.dp))
                            }
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                item.title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Ink900
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                item.body,
                                fontSize = 13.sp,
                                color = Ink600,
                                lineHeight = 19.sp
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(100.dp))
        }
    }
}
