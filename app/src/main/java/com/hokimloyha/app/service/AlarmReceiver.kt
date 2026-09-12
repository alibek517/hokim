package com.hokimloyha.app.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.hokimloyha.app.HokimApp

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "com.hokimloyha.app.ACTION_KEEP_ALIVE") {
            val prefs = context.getSharedPreferences("hokim_app_prefs", Context.MODE_PRIVATE)
            val currentUserJson = prefs.getString("current_user", null)
            val username = prefs.getString("current_username", null)
            if (!currentUserJson.isNullOrEmpty()) {
                val serviceIntent = Intent(context, TrackerService::class.java).apply {
                    if (!username.isNullOrBlank()) {
                        putExtra("device_id", username)
                    }
                }
                try {
                    ContextCompat.startForegroundService(context, serviceIntent)
                } catch (_: Exception) {}
            }
            return
        }

        val title = intent.getStringExtra("title") ?: "Rejalashtirilgan vazifa"
        val location = intent.getStringExtra("location") ?: "Belgilangan joy"
        val scheduleId = intent.getStringExtra("scheduleId") ?: ""

        val helper = NotificationHelper(context)
        helper.showScheduleReminder(scheduleId.hashCode(), title, location)

        // Belgilangan reja xabarnomasi yuborilgan deb belgilash
        val app = context.applicationContext as? HokimApp
        if (scheduleId.isNotEmpty()) {
            app?.storage?.markScheduleNotified(scheduleId)
        }
    }
}

object ScheduleScheduler {

    fun scheduleReminder(context: Context, scheduleId: String, title: String, location: String, triggerAtMillis: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("scheduleId", scheduleId)
            putExtra("title", title)
            putExtra("location", location)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            scheduleId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Agar vaqt o'tmishda bo'lmasa belgilash
        if (triggerAtMillis > System.currentTimeMillis()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            }
        }
    }

    fun cancelReminder(context: Context, scheduleId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            scheduleId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }
}
