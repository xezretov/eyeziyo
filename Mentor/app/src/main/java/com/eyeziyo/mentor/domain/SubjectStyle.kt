package com.eyeziyo.mentor.domain

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Visual identity per subject — color + icon + emoji. Used by lesson cards,
 * stats radar, etc. Falls back to a neutral palette for unknown subjects.
 *
 * Detection is heuristic: we match against the lesson's `course_type` first,
 * then fall back to keywords in the topic. Backend free-text means we can't
 * be 100% accurate, but missing a match degrades to "neutral", not a crash.
 */
data class SubjectStyle(
    val key: String,
    val displayName: String,
    val color: Color,
    val icon: ImageVector,
    val emoji: String,
)

object SubjectPalette {
    private val math       = SubjectStyle("math",       "Matematika",  Color(0xFF2563EB), Icons.Default.Functions,        "🧮")
    private val physics    = SubjectStyle("physics",    "Fizika",      Color(0xFFEA580C), Icons.Default.Science,          "⚛️")
    private val chemistry  = SubjectStyle("chemistry",  "Kimyo",       Color(0xFF16A34A), Icons.Default.Biotech,           "🧪")
    private val biology    = SubjectStyle("biology",    "Biologiya",   Color(0xFF059669), Icons.Default.LocalFlorist,      "🌿")
    private val history    = SubjectStyle("history",    "Tarix",       Color(0xFFB45309), Icons.Default.Castle,            "🏛️")
    private val geography  = SubjectStyle("geography",  "Geografiya",  Color(0xFF0EA5E9), Icons.Default.Public,            "🌍")
    private val literature = SubjectStyle("literature", "Adabiyot",    Color(0xFFC026D3), Icons.Default.AutoStories,       "📚")
    private val english    = SubjectStyle("english",    "Ingliz tili", Color(0xFF7C3AED), Icons.Default.Language,          "🇬🇧")
    private val russian    = SubjectStyle("russian",    "Rus tili",    Color(0xFFDC2626), Icons.Default.Translate,         "🇷🇺")
    private val uzbek      = SubjectStyle("uzbek",      "O'zbek tili", Color(0xFF0891B2), Icons.AutoMirrored.Filled.MenuBook,          "📖")
    private val it         = SubjectStyle("it",         "Informatika", Color(0xFF4338CA), Icons.Default.Computer,          "💻")
    private val art        = SubjectStyle("art",        "San'at",      Color(0xFFDB2777), Icons.Default.Palette,           "🎨")
    private val music      = SubjectStyle("music",      "Musiqa",      Color(0xFFEAB308), Icons.Default.MusicNote,         "🎵")
    private val pe         = SubjectStyle("pe",         "Jismoniy",    Color(0xFF15803D), Icons.Default.SportsBasketball,  "⚽")
    private val neutral    = SubjectStyle("neutral",    "Boshqa",      Color(0xFF64748B), Icons.Default.School,            "📘")

    private val allBySubject: List<SubjectStyle> = listOf(
        math, physics, chemistry, biology, history, geography,
        literature, english, russian, uzbek, it, art, music, pe,
    )

    private val keywords: List<Pair<List<String>, SubjectStyle>> = listOf(
        listOf("matem", "math", "algebr", "geometr", "trigon")          to math,
        listOf("fizik", "physics", "physic")                              to physics,
        listOf("kimy", "chem")                                            to chemistry,
        listOf("biolog", "anatom")                                        to biology,
        listOf("tarix", "history", "istor")                               to history,
        listOf("geograf", "geo")                                          to geography,
        listOf("adabiyot", "liter")                                       to literature,
        listOf("ingliz", "english", "англ")                               to english,
        listOf("rus", "russ", "русск")                                    to russian,
        listOf("o'zbek", "uzbek", "узбек")                                to uzbek,
        listOf("informat", "comput", "kompyut", "dast", "code", "kod")    to it,
        listOf("san'at", "art", "rasm")                                   to art,
        listOf("musiq", "music")                                          to music,
        listOf("jismoniy", "sport", "p.e.", "pe ")                        to pe,
    )

    fun resolve(courseType: String?, topic: String?): SubjectStyle {
        val haystack = ((courseType ?: "") + " " + (topic ?: "")).lowercase()
        for ((words, style) in keywords) {
            if (words.any { haystack.contains(it) }) return style
        }
        return neutral
    }

    fun all(): List<SubjectStyle> = allBySubject + neutral
}
