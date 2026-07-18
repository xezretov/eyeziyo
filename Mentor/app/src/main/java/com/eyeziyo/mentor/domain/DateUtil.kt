package com.eyeziyo.mentor.domain

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DateUtil {
    private val isoDay = ThreadLocal.withInitial {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
    }
    private val readable = ThreadLocal.withInitial {
        SimpleDateFormat("d MMM, HH:mm", Locale("uz")).apply { timeZone = TimeZone.getDefault() }
    }
    private val timeOnly = ThreadLocal.withInitial {
        SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = TimeZone.getDefault() }
    }

    fun todayIso(): String = isoDay.get()!!.format(Date())

    fun isoDay(timeMs: Long): String = isoDay.get()!!.format(Date(timeMs))

    fun previousIso(iso: String): String {
        val cal = Calendar.getInstance().apply { time = isoDay.get()!!.parse(iso)!! }
        cal.add(Calendar.DAY_OF_MONTH, -1)
        return isoDay.get()!!.format(cal.time)
    }

    fun nextIso(iso: String): String {
        val cal = Calendar.getInstance().apply { time = isoDay.get()!!.parse(iso)!! }
        cal.add(Calendar.DAY_OF_MONTH, 1)
        return isoDay.get()!!.format(cal.time)
    }

    fun daysBetween(fromIso: String, toIso: String): Int {
        val f = isoDay.get()!!.parse(fromIso) ?: return 0
        val t = isoDay.get()!!.parse(toIso) ?: return 0
        val diffMs = t.time - f.time
        return (diffMs / (24L * 60 * 60 * 1000)).toInt()
    }

    fun parseIsoOrNull(s: String?): Long? {
        if (s.isNullOrBlank()) return null
        // Accept multiple ISO-ish formats from the backend
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd",
        )
        for (p in patterns) {
            try {
                val sdf = SimpleDateFormat(p, Locale.US)
                if (p.endsWith("'Z'")) sdf.timeZone = TimeZone.getTimeZone("UTC")
                return sdf.parse(s)?.time
            } catch (_: Exception) {}
        }
        return null
    }

    fun formatTime(timeMs: Long): String = timeOnly.get()!!.format(Date(timeMs))
    fun formatReadable(timeMs: Long): String = readable.get()!!.format(Date(timeMs))

    /** Returns "Bugun", "Kecha", or readable date. */
    fun formatRelativeDay(iso: String): String {
        val today = todayIso()
        val yesterday = previousIso(today)
        return when (iso) {
            today -> "Bugun"
            yesterday -> "Kecha"
            else -> iso
        }
    }
}
