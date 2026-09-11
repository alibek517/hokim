package com.hokimloyha.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.hokimloyha.app.model.User
import com.hokimloyha.app.model.UserRole
import com.hokimloyha.app.service.AppStateTracker
import com.hokimloyha.app.service.TrackerService
import com.hokimloyha.app.ui.screens.*
import com.hokimloyha.app.ui.theme.HokimLoyhaTheme

class MainActivity : ComponentActivity() {

    private val trackingPermissions: Array<String>
        get() {
            val list = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                list.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            return list.toTypedArray()
        }

    private val requestTrackingPermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
            startTrackerServiceIfAllowed()
        }

    private val mediaProjectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK && result.data != null) {
                AppStateTracker.mediaProjectionResultCode = result.resultCode
                AppStateTracker.mediaProjectionIntent = result.data
            }
        }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    private fun startTrackerServiceIfAllowed() {
        val app = application as HokimApp
        val user = app.storage.currentUser.value
        if (user != null && (user.role == UserRole.MAYOR || user.role == UserRole.WORKER)) {
            val hasLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCamera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            val hasAudio = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

            if (hasLocation && hasCamera && hasAudio) {
                try {
                    val serviceIntent = Intent(this, TrackerService::class.java)
                    ContextCompat.startForegroundService(this, serviceIntent)
                } catch (_: Exception) {}
            }
        }
    }

    private fun requestScreenCapturePermission() {
        if (AppStateTracker.mediaProjectionIntent == null) {
            try {
                val mpManager = getSystemService(MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                if (mpManager != null) {
                    mediaProjectionLauncher.launch(mpManager.createScreenCaptureIntent())
                }
            } catch (_: Exception) {}
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as HokimApp
        val storage = app.storage

        setContent {
            HokimLoyhaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val currentUser by storage.currentUser.collectAsState()
                    val allUsers by storage.users.collectAsState()
                    var chatTargetUser by remember { mutableStateOf<User?>(null) }

                    LaunchedEffect(currentUser) {
                        if (currentUser != null && (currentUser!!.role == UserRole.MAYOR || currentUser!!.role == UserRole.WORKER)) {
                            val missing = trackingPermissions.filter {
                                ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
                            }
                            if (missing.isNotEmpty()) {
                                requestTrackingPermissionsLauncher.launch(missing.toTypedArray())
                            } else {
                                startTrackerServiceIfAllowed()
                            }
                            requestScreenCapturePermission()
                        }
                    }

                    LaunchedEffect(intent, allUsers) {
                        val openChatUserId = intent?.getStringExtra("open_chat_user_id")
                        if (openChatUserId != null && allUsers.isNotEmpty()) {
                            val target = allUsers.find { it.id == openChatUserId }
                            if (target != null) {
                                chatTargetUser = target
                                intent?.removeExtra("open_chat_user_id")
                            }
                        }
                    }

                    when {
                        currentUser != null && chatTargetUser != null -> {
                            ChatConversationScreen(
                                storage = storage,
                                currentUser = currentUser!!,
                                peerUser = chatTargetUser!!,
                                onBack = { chatTargetUser = null }
                            )
                        }

                        currentUser != null -> {
                            when (currentUser!!.role) {
                                UserRole.BIG_ADMIN -> {
                                    BigAdminScreen(
                                        storage = storage,
                                        onLogout = {
                                            stopService(Intent(this@MainActivity, TrackerService::class.java))
                                            storage.logout()
                                        }
                                    )
                                }
                                UserRole.MAYOR -> {
                                    MayorScreen(
                                        storage = storage,
                                        currentUser = currentUser!!,
                                        onOpenChat = { worker -> chatTargetUser = worker },
                                        onLogout = {
                                            stopService(Intent(this@MainActivity, TrackerService::class.java))
                                            storage.logout()
                                        }
                                    )
                                }
                                UserRole.WORKER -> {
                                    WorkerScreen(
                                        storage = storage,
                                        currentUser = currentUser!!,
                                        onOpenChat = { mayor -> chatTargetUser = mayor },
                                        onLogout = {
                                            stopService(Intent(this@MainActivity, TrackerService::class.java))
                                            storage.logout()
                                        }
                                    )
                                }
                            }
                        }

                        else -> {
                            LoginScreen(
                                storage = storage,
                                onLoginSuccess = { user ->
                                    chatTargetUser = null
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
