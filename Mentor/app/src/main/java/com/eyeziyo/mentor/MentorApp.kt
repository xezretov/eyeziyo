package com.eyeziyo.mentor

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.eyeziyo.mentor.data.prefs.SessionManager
import com.eyeziyo.mentor.data.prefs.SettingsStore
import com.eyeziyo.mentor.data.repo.Repos
import com.eyeziyo.mentor.push.ReminderScheduler
import com.eyeziyo.mentor.util.LocaleApplier

class MentorApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionManager.init(this)
        SettingsStore.init(this)
        Repos.init(this)
        LocaleApplier.apply(this, SettingsStore.language.value)
        ensureNotificationChannel()
        ReminderScheduler.schedule(this)
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channelId = getString(R.string.default_notification_channel_id)
            val mgr = getSystemService(NotificationManager::class.java) ?: return
            if (mgr.getNotificationChannel(channelId) == null) {
                val ch = NotificationChannel(channelId, "Mentor", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Streak, takrorlash va eslatmalar"
                }
                mgr.createNotificationChannel(ch)
            }
        }
    }
}
