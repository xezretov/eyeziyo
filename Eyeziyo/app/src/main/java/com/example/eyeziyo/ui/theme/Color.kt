package com.example.eyeziyo.ui.theme

import androidx.compose.ui.graphics.Color

// ═══════════════════════════════════════════════════════════════════
// Eyeziyo — Soft Educational palette
// Warm, friendly, light. Pastel tints + bold primary + clean neutrals.
// ═══════════════════════════════════════════════════════════════════

// Brand (cyan-teal, fresh + educational)
val Primary = Color(0xFF0891B2)        // cyan-600
val PrimaryDark = Color(0xFF0E7490)    // cyan-700
val Accent = Color(0xFF06B6D4)         // cyan-500
val PrimaryBg = Color(0xFFECFEFF)      // cyan-50
val PrimarySoft = Color(0xFFCFFAFE)    // cyan-100
val SkyBlue = Color(0xFF38BDF8)        // sky-400

// Secondary brand accents (pastel educational palette)
val Violet = Color(0xFF7C3AED)         // violet-600
val VioletBg = Color(0xFFEDE9FE)       // violet-100
val Coral = Color(0xFFF43F5E)          // rose-500
val CoralBg = Color(0xFFFFE4E6)        // rose-100
val Sunny = Color(0xFFF59E0B)          // amber-500
val SunnyBg = Color(0xFFFEF3C7)        // amber-100
val Mint = Color(0xFF10B981)           // emerald-500
val MintBg = Color(0xFFD1FAE5)         // emerald-100
val Peach = Color(0xFFFB923C)          // orange-400
val PeachBg = Color(0xFFFFEDD5)        // orange-100
val Lavender = Color(0xFFA78BFA)       // violet-400
val LavenderBg = Color(0xFFF5F3FF)     // violet-50

// Status semantics
val Success = Color(0xFF10B981)
val SuccessBg = Color(0xFFD1FAE5)
val SuccessDark = Color(0xFF047857)
val Warning = Color(0xFFF59E0B)
val WarningBg = Color(0xFFFEF3C7)
val WarningDark = Color(0xFFB45309)
val Danger = Color(0xFFEF4444)
val DangerBg = Color(0xFFFEE2E2)
val DangerDark = Color(0xFFB91C1C)

// Surface / Background
val Surface = Color(0xFFFFFFFF)
val SurfaceLight = Surface                // legacy alias
val Canvas = Color(0xFFFFFBF5)            // warm cream background
val BackgroundLight = Canvas              // legacy alias
val CardBorder = Color(0xFFF3F0EA)        // barely visible border on cream
val BorderSoft = Color(0xFFE2E8F0)

// Neutrals (warmer than pure gray — suits cream bg)
val Ink900 = Color(0xFF1C1917)     // stone-900
val Ink800 = Color(0xFF292524)     // stone-800
val Ink700 = Color(0xFF44403C)     // stone-700
val Ink600 = Color(0xFF57534E)     // stone-600
val Ink500 = Color(0xFF78716C)     // stone-500
val Ink400 = Color(0xFFA8A29E)     // stone-400
val Ink300 = Color(0xFFD6D3D1)     // stone-300
val Ink200 = Color(0xFFE7E5E4)     // stone-200
val Ink100 = Color(0xFFF5F5F4)     // stone-100
val Ink50 = Color(0xFFFAFAF9)      // stone-50

// Legacy gray aliases (kept so existing code still compiles during migration)
val Gray50 = Ink50
val Gray100 = Ink100
val Gray200 = Ink200
val Gray300 = Ink300
val Gray400 = Ink400
val Gray500 = Ink500
val Gray600 = Ink600
val Gray700 = Ink700
val Gray800 = Ink800
val Gray900 = Ink900

// Legacy semantic aliases (kept for migration)
val Green600 = Success
val Green100 = SuccessBg
val Green50 = Color(0xFFF0FDF4)
val GreenText = SuccessDark
val Emerald50 = Color(0xFFECFDF5)
val Emerald600 = Success
val Emerald500 = Mint
val Rose100 = CoralBg
val Rose600 = Coral
val Red50 = DangerBg
val Red500 = Danger
val Red600 = DangerDark
val Orange100 = PeachBg
val Orange500 = Peach
val Orange600 = Color(0xFFEA580C)
val Amber100 = WarningBg
val Amber700 = WarningDark
val Yellow50 = Color(0xFFFEFCE8)
val Yellow300 = Color(0xFFFDE047)
val Yellow400 = Color(0xFFFACC15)
val Blue100 = Color(0xFFDBEAFE)
val Blue600 = Color(0xFF2563EB)
val Purple100 = VioletBg
val Purple500 = Lavender
val Purple600 = Violet
val Indigo100 = Color(0xFFE0E7FF)
val Indigo600 = Color(0xFF4F46E5)
val Pink500 = Color(0xFFEC4899)
val Pink600 = Color(0xFFDB2777)
val Teal100 = PrimarySoft
val Teal600 = PrimaryDark
