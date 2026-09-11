package com.hokimloyha.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
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
import com.hokimloyha.app.ui.screens.*
import com.hokimloyha.app.ui.theme.HokimLoyhaTheme

class MainActivity : ComponentActivity() {

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ -> }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 13+ uchun Notification ruxsatini so'rash
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        val app = application as HokimApp
        val storage = app.storage

        setContent {
            HokimLoyhaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val currentUser by storage.currentUser.collectAsState()
                    val allUsers by storage.users.collectAsState()
                    var chatTargetUser by remember { mutableStateOf<User?>(null) }

                    // Bildirishnomadan bosilganda avtomatik suhbatni ochish
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
                        // 1. Agar foydalanuvchi chat ochgan bo'lsa
                        currentUser != null && chatTargetUser != null -> {
                            ChatConversationScreen(
                                storage = storage,
                                currentUser = currentUser!!,
                                peerUser = chatTargetUser!!,
                                onBack = { chatTargetUser = null }
                            )
                        }

                        // 2. Agar foydalanuvchi tizimga kirgan bo'lsa
                        currentUser != null -> {
                            when (currentUser!!.role) {
                                UserRole.BIG_ADMIN -> {
                                    BigAdminScreen(
                                        storage = storage,
                                        onLogout = { storage.logout() }
                                    )
                                }
                                UserRole.MAYOR -> {
                                    MayorScreen(
                                        storage = storage,
                                        currentUser = currentUser!!,
                                        onOpenChat = { worker -> chatTargetUser = worker },
                                        onLogout = { storage.logout() }
                                    )
                                }
                                UserRole.WORKER -> {
                                    WorkerScreen(
                                        storage = storage,
                                        currentUser = currentUser!!,
                                        onOpenChat = { mayor -> chatTargetUser = mayor },
                                        onLogout = { storage.logout() }
                                    )
                                }
                            }
                        }

                        // 3. Agar tizimga kirmagan bo'lsa -> Login ekrani
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
