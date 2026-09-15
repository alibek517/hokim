package com.hokimloyha.app.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.hokimloyha.app.MainActivity

class NotificationHelper(private val context: Context) {

    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        const val CHANNEL_SCHEDULE = "channel_hokim_schedule"
        const val CHANNEL_TASKS = "channel_hokim_tasks"
        const val CHANNEL_MESSAGES = "channel_hokim_messages"
    }

    init {
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val alarmSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: defaultSoundUri

            val notificationAudioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            val alarmAudioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build()

            // Kunlik reja kanali (Yuqori ustuvorlik, ovozli)
            val scheduleChannel = NotificationChannel(
                CHANNEL_SCHEDULE,
                "Hokim Kunlik Rejalari (Ovozli eslatma)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Uchrashuvdan 30 daqiqa oldin ovozli eslatma"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
                setSound(alarmSoundUri, alarmAudioAttributes)
            }

            // Topshiriqlar va muddatlar kanali
            val taskChannel = NotificationChannel(
                CHANNEL_TASKS,
                "Topshiriqlar va Muddat Nazorati",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Yangi topshiriqlar va kechikkan ishlar ogohlantirishi"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                setSound(defaultSoundUri, notificationAudioAttributes)
            }

            // Xabarlar va yozishmalar kanali (Chat)
            val messageChannel = NotificationChannel(
                CHANNEL_MESSAGES,
                "Yozishmalar va Xabarlar (Chat)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Yangi chat xabarlari xabarnomasi"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
                setSound(defaultSoundUri, notificationAudioAttributes)
            }

            notificationManager.createNotificationChannel(scheduleChannel)
            notificationManager.createNotificationChannel(taskChannel)
            notificationManager.createNotificationChannel(messageChannel)
        }
    }

    private fun playSoundDirectly(type: Int = RingtoneManager.TYPE_NOTIFICATION) {
        try {
            val uri = RingtoneManager.getDefaultUri(type)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(context.applicationContext, uri)
            ringtone?.play()
        } catch (_: Exception) {}
    }

    fun showScheduleReminder(id: Int, title: String, location: String) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, CHANNEL_SCHEDULE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Eslatma: 30 daqiqadan so'ng uchrashuv!")
            .setContentText("$title ($location)")
            .setStyle(NotificationCompat.BigTextStyle().bigText("Hurmatli Hokim!\nRejalashtirilgan vaqtga 30 daqiqa qoldi.\nManzil: $location\nReja: $title"))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(id, builder.build())
        playSoundDirectly(RingtoneManager.TYPE_ALARM)
    }

    fun showTaskAlert(id: Int, title: String, message: String, isUrgent: Boolean = false) {
        val intent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, CHANNEL_TASKS)
            .setSmallIcon(if (isUrgent) android.R.drawable.stat_notify_error else android.R.drawable.stat_notify_more)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(if (isUrgent) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(id, builder.build())
        playSoundDirectly(RingtoneManager.TYPE_NOTIFICATION)
    }

    fun showChatMessageNotification(id: Int, senderName: String, messageText: String, senderId: String) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_chat_user_id", senderId)
        }
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("$senderName")
            .setContentText(messageText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(messageText))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 250, 150, 250))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(id, builder.build())
        playSoundDirectly(RingtoneManager.TYPE_NOTIFICATION)
    }
}
