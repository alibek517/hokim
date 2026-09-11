package com.hokimloyha.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val prefs = context.getSharedPreferences("hokim_app_prefs", Context.MODE_PRIVATE)
            val currentUserJson = prefs.getString("current_user", null)
            if (!currentUserJson.isNullOrEmpty()) {
                val serviceIntent = Intent(context, TrackerService::class.java)
                try {
                    ContextCompat.startForegroundService(context, serviceIntent)
                } catch (_: Exception) {}
            }
        }
    }
}
