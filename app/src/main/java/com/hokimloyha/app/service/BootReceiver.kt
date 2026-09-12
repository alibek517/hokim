package com.hokimloyha.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d("BootReceiver", "Received action: $action")

        val validActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            "com.hokimloyha.app.ACTION_RESTART_SERVICE"
        )

        if (action in validActions || action.isNullOrBlank()) {
            val hokimPrefs = context.getSharedPreferences("hokim_app_prefs", Context.MODE_PRIVATE)
            val appPrefs = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
            val username = hokimPrefs.getString("current_username", null)
                ?: appPrefs.getString("current_username", null)
                ?: "hokim"

            val serviceIntent = Intent(context, TrackerService::class.java).apply {
                putExtra("device_id", username)
            }
            try {
                ContextCompat.startForegroundService(context, serviceIntent)
            } catch (e: Exception) {
                Log.e("BootReceiver", "Failed to start TrackerService: ${e.message}")
            }
        }
    }
}
