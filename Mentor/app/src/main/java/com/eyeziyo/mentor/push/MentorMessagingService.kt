package com.eyeziyo.mentor.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.eyeziyo.mentor.MainActivity
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.PushApi
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives FCM pushes. Backend should push two payload types:
 *  - `data: {type: "lesson_added", lesson_id: 42, title, body}`
 *  - `data: {type: "review_due", count: 7, title, body}`
 * For unknown payloads we fall back to `notification` block if present.
 *
 * Token registration: every onNewToken we ping `/api/push/register`. If the
 * endpoint isn't there yet PushApi swallows the failure.
 */
class MentorMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { PushApi.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.data["title"] ?: message.notification?.title ?: getString(R.string.app_name)
        val body = message.data["body"] ?: message.notification?.body ?: ""
        showNotification(this, title, body)
    }

    companion object {
        fun showNotification(context: Context, title: String, body: String) {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            val pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val builder = NotificationCompat.Builder(
                context,
                context.getString(R.string.default_notification_channel_id),
            )
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi)

            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.notify(System.currentTimeMillis().toInt(), builder.build())
        }
    }
}
