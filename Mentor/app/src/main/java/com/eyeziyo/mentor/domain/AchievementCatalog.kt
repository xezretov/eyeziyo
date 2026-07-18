package com.eyeziyo.mentor.domain

import androidx.compose.ui.graphics.Color

/**
 * Local-only catalog. Adding a new badge: append a new entry; the evaluator
 * picks it up on the next event without code changes elsewhere.
 *
 * `target` is the value progress must reach to unlock. For boolean badges
 * (e.g. "first 100%") target = 1.
 */
data class Achievement(
    val key: String,
    val title: String,
    val subtitle: String,
    val target: Int,
    val emoji: String,
    val tier: Tier,
) {
    enum class Tier(val color: Color) {
        Bronze(Color(0xFFB45309)),
        Silver(Color(0xFF64748B)),
        Gold(Color(0xFFD97706)),
        Platinum(Color(0xFF7C3AED)),
    }
}

object AchievementCatalog {
    val all: List<Achievement> = listOf(
        Achievement("first_lesson",    "Birinchi qadam",       "Birinchi darsni oching",         1, "🎯", Achievement.Tier.Bronze),
        Achievement("first_test",      "Birinchi test",        "Birinchi testni topshiring",     1, "📝", Achievement.Tier.Bronze),
        Achievement("perfect_score",   "Mukammal!",            "Test ballingiz 100% bo'lsin",    1, "💯", Achievement.Tier.Gold),
        Achievement("eighty_x10",      "10 ta a'lo",           "80%+ bilan 10 ta test",          10, "🌟", Achievement.Tier.Silver),
        Achievement("eighty_x50",      "50 ta a'lo",           "80%+ bilan 50 ta test",          50, "🏆", Achievement.Tier.Gold),
        Achievement("streak_3",        "3 kunlik seriya",      "3 kun ketma-ket faoliyat",       3, "🔥", Achievement.Tier.Bronze),
        Achievement("streak_7",        "1 hafta",              "7 kun ketma-ket faoliyat",       7, "🔥", Achievement.Tier.Silver),
        Achievement("streak_30",       "1 oy",                 "30 kun ketma-ket faoliyat",      30, "🔥", Achievement.Tier.Gold),
        Achievement("streak_100",      "Yuz kunlik",           "100 kun ketma-ket faoliyat",     100, "🔥", Achievement.Tier.Platinum),
        Achievement("flashcards_50",   "Yoddor",               "50 ta flashcard ko'rib chiqing", 50, "🎴", Achievement.Tier.Silver),
        Achievement("flashcards_500",  "Sehrgar",              "500 ta flashcard",               500, "🎴", Achievement.Tier.Gold),
        Achievement("chat_100",        "Qiziquvchan",          "AI'ga 100 ta savol",             100, "💬", Achievement.Tier.Silver),
        Achievement("night_owl",       "Tungi qush",           "Yarim tundan keyin dars qiling", 1, "🦉", Achievement.Tier.Bronze),
        Achievement("early_bird",      "Tongchi",              "Tongning 6 dan oldin dars",      1, "🌅", Achievement.Tier.Bronze),
        Achievement("comeback",        "Qaytish",              "7 kunlik tanaffusdan keyin",     1, "🔄", Achievement.Tier.Bronze),
        Achievement("subject_master",  "Mavzu ustasi",         "Bir predmetda 90%+ o'rtacha",    1, "🎓", Achievement.Tier.Gold),
    )

    fun byKey(key: String): Achievement? = all.firstOrNull { it.key == key }
}
