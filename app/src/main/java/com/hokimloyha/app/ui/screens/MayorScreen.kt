package com.hokimloyha.app.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.animation.core.*
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.model.ScheduleItem
import com.hokimloyha.app.model.TaskItem
import com.hokimloyha.app.model.TaskStatus
import com.hokimloyha.app.model.User
import com.hokimloyha.app.model.UserRole
import com.hokimloyha.app.service.NotificationHelper
import com.hokimloyha.app.service.ScheduleScheduler
import com.hokimloyha.app.service.TaskDeadlineWorker
import com.hokimloyha.app.ui.components.TaskStatusBadge
import com.hokimloyha.app.ui.theme.*
import com.hokimloyha.app.util.RatingCalculator
import com.hokimloyha.app.util.WorkerStats
import androidx.compose.foundation.border
import com.hokimloyha.app.HokimApp
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.core.content.ContextCompat
import com.hokimloyha.app.model.ChatMessage
import com.hokimloyha.app.model.MessageType
import com.hokimloyha.app.service.VoiceRecorder
import com.hokimloyha.app.service.VoicePlayer
import kotlinx.coroutines.delay
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun MayorScreen(
    storage: AppStorage,
    currentUser: User,
    onOpenChat: (worker: User) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showAiJarvisDialog by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current
    var lastBackPressTime by remember { mutableStateOf(0L) }

    // 1 ta orqaga bossa Asosiy (Home) sahifaga qaytadi, home page da turganda 2 marta tez bossa ilovadan chiqadi
    androidx.activity.compose.BackHandler(enabled = true) {
        if (selectedTab != 0) {
            selectedTab = 0
        } else {
            val now = System.currentTimeMillis()
            if (now - lastBackPressTime < 2000L) {
                (context as? android.app.Activity)?.moveTaskToBack(true)
            } else {
                lastBackPressTime = now
                Toast.makeText(context, "Ilovadan chiqish uchun yana bir marta bosing", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
        topBar = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(NavyDark)
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { showProfileDialog = true }
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(PrimaryBlue),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Person, contentDescription = null, tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(currentUser.fullName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(currentUser.regionOrDistrict ?: "Hokimlik Paneli", color = TextSecondary, fontSize = 12.sp)
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // AI Jarvis Button (Faqat Hokim uchun)
                        IconButton(onClick = { showAiJarvisDialog = !showAiJarvisDialog }) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFF6366F1))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Icon(Icons.Default.Star, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("AI", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                            }
                        }

                        IconButton(onClick = { showProfileDialog = true }) {
                            Icon(Icons.Default.AccountCircle, contentDescription = "Profil va Parol", tint = Color.White)
                        }

                        IconButton(onClick = {
                            TaskDeadlineWorker.checkDeadlines(context, storage)
                            Toast.makeText(context, "Muddatlar tekshirildi!", Toast.LENGTH_SHORT).show()
                        }) {
                            Icon(Icons.Default.Warning, contentDescription = "Muddatlar", tint = Color(0xFFFBBF24))
                        }

                        IconButton(onClick = onLogout) {
                            Icon(Icons.Default.ExitToApp, contentDescription = "Chiqish", tint = Color.White)
                        }
                    }
                }
            }
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.List, contentDescription = null) },
                    label = { Text("Topshiriqlar", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.DateRange, contentDescription = null) },
                    label = { Text("Rejalar", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.AccountBox, contentDescription = null) },
                    label = { Text("Ishchilar", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Email, contentDescription = null) },
                    label = { Text("Chatlar", fontSize = 11.sp) }
                )
            }
        },
        containerColor = SlateBg
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (selectedTab) {
                0 -> MayorTasksTab(storage, currentUser)
                1 -> MayorScheduleTab(storage, currentUser)
                2 -> MayorWorkersTab(storage, currentUser, onOpenChat)
                3 -> MayorChatsTab(storage, currentUser, onOpenChat)
            }
        }
    }

    // iPhone Siri Floating Orb at Bottom Center (Scaffold ustida suzuvchi iPhone Siri shari)
    if (showAiJarvisDialog) {
        AiJarvisFloatingOrb(
            storage = storage,
            currentUser = currentUser,
            onDismiss = { showAiJarvisDialog = false },
            onSwitchTab = { tab ->
                selectedTab = tab
            },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp)
        )
    }
}

    if (showProfileDialog) {
        var myFirstName by remember { mutableStateOf(currentUser.firstName ?: "") }
        var myLastName by remember { mutableStateOf(currentUser.lastName ?: "") }
        var myPhone by remember { mutableStateOf(currentUser.phone ?: "") }
        var myUsername by remember { mutableStateOf(currentUser.username) }
        var myPassword by remember { mutableStateOf(currentUser.password) }
        var isPasswordVisible by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { showProfileDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryBlue)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Profil va Kirish Ma'lumotlari", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState())
                ) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(currentUser.fullName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                            Text(currentUser.regionOrDistrict ?: "Hokimlik Paneli", fontSize = 11.5.sp, color = PrimaryBlue)
                        }
                    }

                    OutlinedTextField(
                        value = myFirstName,
                        onValueChange = { myFirstName = it },
                        label = { Text("Ism *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = myLastName,
                        onValueChange = { myLastName = it },
                        label = { Text("Familiya") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = myPhone,
                        onValueChange = { myPhone = it },
                        label = { Text("Telefon raqami") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = myUsername,
                        onValueChange = { myUsername = it },
                        label = { Text("Foydalanuvchi nomi (Login) *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = myPassword,
                        onValueChange = { myPassword = it },
                        label = { Text("Maxfiy parol *") },
                        singleLine = true,
                        visualTransformation = if (isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isPasswordVisible = !isPasswordVisible }) {
                                Icon(
                                    imageVector = if (isPasswordVisible) Icons.Default.Lock else Icons.Default.Info,
                                    contentDescription = "Ko'rsatish/Yashirish"
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val fn = myFirstName.trim()
                        val u = myUsername.trim()
                        val p = myPassword.trim()
                        if (fn.isBlank() || u.isBlank() || p.isBlank()) {
                            Toast.makeText(context, "Ism, login va parolni kiriting!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val exists = storage.users.value.any { it.id != currentUser.id && it.username.equals(u, ignoreCase = true) }
                        if (exists) {
                            Toast.makeText(context, "Bu login boshqa foydalanuvchi tomonidan band qilingan!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val updated = currentUser.copy(
                            firstName = fn,
                            lastName = myLastName.trim(),
                            phone = myPhone.trim().ifBlank { null },
                            username = u,
                            password = p
                        )
                        storage.updateUser(updated)
                        Toast.makeText(context, "Profil ma'lumotlari muvaffaqiyatli saqlandi!", Toast.LENGTH_SHORT).show()
                        showProfileDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Saqlash", color = Color.White)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showProfileDialog = false }) {
                    Text("Bekor qilish")
                }
            }
        )
    }
}

@Composable
fun MayorScheduleTab(storage: AppStorage, currentUser: User) {
    val context = LocalContext.current
    val schedules by storage.schedules.collectAsState()
    val mayorSchedules = schedules.filter { it.mayorId == currentUser.id }
        .sortedBy { it.scheduledTime }
    var showAddDialog by remember { mutableStateOf(false) }
    var scheduleToEdit by remember { mutableStateOf<ScheduleItem?>(null) }
    var scheduleToDelete by remember { mutableStateOf<ScheduleItem?>(null) }
    var scheduleSearchQuery by remember { mutableStateOf("") }
    val timeFormat = remember { SimpleDateFormat("HH:mm, dd-MMMM", Locale("uz")) }
    val voicePlayer = remember { VoicePlayer() }
    var playingVoiceKey by remember { mutableStateOf<String?>(null) }

    val searchedSchedules = mayorSchedules.filter {
        if (scheduleSearchQuery.isBlank()) true
        else {
            val q = scheduleSearchQuery.trim().lowercase()
            it.title.lowercase().contains(q) ||
            it.location.lowercase().contains(q) ||
            (it.notes ?: "").lowercase().contains(q)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            voicePlayer.stop()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E3A8A))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Notifications, contentDescription = null, tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("30 Daqiqa Oldin Ovozli Signal", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text("Rejadan 30 daqiqa oldin ovozli eslatma bildirishnomasi yangraydi.", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Kunlik Rejalarim", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)

                OutlinedButton(
                    onClick = {
                        val helper = NotificationHelper(context)
                        helper.showScheduleReminder(
                            id = 999,
                            title = "24-sonli maktabga tashrif",
                            location = "Navoiy ko'chasi 24-maktab"
                        )
                        Toast.makeText(context, "Ovozli bildirishnoma yuborildi!", Toast.LENGTH_SHORT).show()
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Notifications, contentDescription = null, modifier = Modifier.size(16.dp), tint = PrimaryBlue)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Signalni sinash", fontSize = 12.sp, color = PrimaryBlue)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = scheduleSearchQuery,
                onValueChange = { scheduleSearchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                placeholder = { Text("Rejalarni qidirish...", fontSize = 12.sp) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(20.dp)
                    )
                },
                trailingIcon = {
                    if (scheduleSearchQuery.isNotBlank()) {
                        IconButton(onClick = { scheduleSearchQuery = "" }) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Tozalash",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Color(0xFFCBD5E1)
                )
            )

            if (searchedSchedules.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Rejalar topilmadi.", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(searchedSchedules) { schedule ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.DateRange, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = timeFormat.format(Date(schedule.scheduledTime)),
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = PrimaryBlue
                                        )
                                    }

                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(Color(0xFFFEF3C7))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Text("-30 min signal", fontSize = 11.sp, color = Color(0xFFB45309), fontWeight = FontWeight.SemiBold)
                                        }

                                        IconButton(
                                            onClick = {
                                                scheduleToEdit = schedule
                                            },
                                            modifier = Modifier.size(26.dp)
                                        ) {
                                            Icon(Icons.Default.Edit, contentDescription = "Tahrirlash", tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                                        }

                                        IconButton(
                                            onClick = {
                                                scheduleToDelete = schedule
                                            },
                                            modifier = Modifier.size(26.dp)
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))
                                Text(schedule.title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NavyDark)

                                if (schedule.location.isNotBlank()) {
                                    Row(modifier = Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(schedule.location, fontSize = 13.sp, color = TextSecondary)
                                    }
                                }

                                if (!schedule.notes.isNullOrBlank()) {
                                    Text(
                                        text = schedule.notes,
                                        fontSize = 12.sp,
                                        color = TextSecondary,
                                        modifier = Modifier.padding(top = 6.dp)
                                    )
                                }

                                // Ovozli yozuvlar ro'yxati (1... nechta bo'lsa)
                                val voices = if (schedule.voiceList.isNotEmpty()) {
                                    schedule.voiceList
                                } else if (!schedule.voiceBase64.isNullOrBlank()) {
                                    listOf(schedule.voiceBase64)
                                } else {
                                    emptyList()
                                }

                                if (voices.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(Color(0xFFF1F5F9))
                                            .padding(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            "Ovozli yozuvlar (${voices.size} ta):",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = PrimaryBlue
                                        )
                                        voices.forEachIndexed { index, voiceB64 ->
                                            val key = "${schedule.id}_$index"
                                            val isPlaying = playingVoiceKey == key
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(Color.White)
                                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    IconButton(
                                                        onClick = {
                                                            if (isPlaying) {
                                                                voicePlayer.stop()
                                                                playingVoiceKey = null
                                                            } else {
                                                                playingVoiceKey = key
                                                                voicePlayer.playBase64(context, voiceB64, key) {
                                                                    playingVoiceKey = null
                                                                }
                                                            }
                                                        },
                                                        modifier = Modifier.size(32.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = if (isPlaying) Icons.Default.Close else Icons.Default.PlayArrow,
                                                            contentDescription = "Ovozni eshitish",
                                                            tint = PrimaryBlue
                                                        )
                                                    }
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text(
                                                        if (isPlaying) "Tinglanmoqda..." else "Ovoz #${index + 1}",
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = NavyDark
                                                    )
                                                }

                                                IconButton(
                                                    onClick = {
                                                        if (isPlaying) {
                                                            voicePlayer.stop()
                                                            playingVoiceKey = null
                                                        }
                                                        storage.deleteScheduleSingleVoice(schedule.id, index)
                                                        Toast.makeText(context, "Ovozli xabar o'chirildi", Toast.LENGTH_SHORT).show()
                                                    },
                                                    modifier = Modifier.size(28.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Delete,
                                                        contentDescription = "O'chirish",
                                                        tint = StatusRed.copy(alpha = 0.8f),
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { showAddDialog = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            containerColor = PrimaryBlue,
            contentColor = Color.White
        ) {
            Icon(Icons.Default.Add, contentDescription = "Reja qo'shish")
        }
    }

    if (showAddDialog) {
        var title by remember { mutableStateOf("") }
        val calendar = remember { Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, 1) } }
        var selectedCalendarTime by remember { mutableStateOf(calendar.timeInMillis) }
        val format = remember { SimpleDateFormat("HH:mm, dd-MM-yyyy", Locale.getDefault()) }

        val scheduleVoiceRecorder = remember { VoiceRecorder(context) }
        val recordedVoices = remember { mutableStateListOf<Pair<String, Int>>() } // (filePath, durationSec)
        var isRecordingVoice by remember { mutableStateOf(false) }
        var recordingDuration by remember { mutableStateOf(0) }
        var playingVoicePath by remember { mutableStateOf<String?>(null) }

        val audioPermissionLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (granted) {
                val path = scheduleVoiceRecorder.startRecording()
                if (path != null) {
                    isRecordingVoice = true
                    recordingDuration = 0
                } else {
                    Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
                }
            } else {
                Toast.makeText(context, "Mikrofon ruxsati berilmadi", Toast.LENGTH_SHORT).show()
            }
        }

        LaunchedEffect(isRecordingVoice) {
            if (isRecordingVoice) {
                while (isRecordingVoice) {
                    delay(1000L)
                    recordingDuration++
                }
            }
        }

        AlertDialog(
            onDismissRequest = {
                voicePlayer.stop()
                if (isRecordingVoice) scheduleVoiceRecorder.cancelRecording()
                showAddDialog = false
            },
            title = { Text("Yangi Reja Kiritish", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // 1 ta yagona "Reja *" maydoni (3 tasi bitta qilingan)
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it },
                        label = { Text("Reja *") },
                        placeholder = { Text("Reja, manzil va eslatmalarni kiriting...") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4
                    )

                    // Ovoz yozish bo'limi (gols)
                    if (isRecordingVoice) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFFEF2F2),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFFEF4444)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFFEF4444))
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Yozilmoqda: ${recordingDuration}s",
                                        color = Color(0xFFDC2626),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    // Bekor qilish / o'chirish
                                    Button(
                                        onClick = {
                                            scheduleVoiceRecorder.cancelRecording()
                                            isRecordingVoice = false
                                            recordingDuration = 0
                                            Toast.makeText(context, "Ovoz bekor qilindi", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(30.dp)
                                    ) {
                                        Text("O'chirish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }

                                    // To'xtatish va ro'yxatga qo'shish
                                    Button(
                                        onClick = {
                                            val res = scheduleVoiceRecorder.stopRecording()
                                            isRecordingVoice = false
                                            recordingDuration = 0
                                            if (res != null) {
                                                recordedVoices.add(res)
                                                Toast.makeText(context, "Ovoz qo'shildi (${recordedVoices.size}-ovoz)", Toast.LENGTH_SHORT).show()
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(30.dp)
                                    ) {
                                        Text("Qo'shish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    } else {
                        Button(
                            onClick = {
                                val hasPermission = ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.RECORD_AUDIO
                                ) == PackageManager.PERMISSION_GRANTED

                                if (hasPermission) {
                                    val path = scheduleVoiceRecorder.startRecording()
                                    if (path != null) {
                                        isRecordingVoice = true
                                        recordingDuration = 0
                                    } else {
                                        Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEFF6FF)),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth(),
                            border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryBlue.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                if (recordedVoices.isEmpty()) "Ovoz yozish (gols)" else "Yana ovoz qo'shish (${recordedVoices.size} ta kiritildi)",
                                color = PrimaryBlue,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Yozilgan ovozlarni tekshirish va eshitish ("golsni tekshirsin")
                    if (recordedVoices.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFF8FAFC))
                                .padding(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("Yozilgan ovozlar (tekshirish):", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = PrimaryBlue)
                            recordedVoices.forEachIndexed { index, pair ->
                                val (path, dur) = pair
                                val isPlayingThis = playingVoicePath == path
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(Color.White)
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .clickable {
                                                if (isPlayingThis) {
                                                    voicePlayer.stop()
                                                    playingVoicePath = null
                                                } else {
                                                    playingVoicePath = path
                                                    voicePlayer.play(path) {
                                                        playingVoicePath = null
                                                    }
                                                }
                                            }
                                    ) {
                                        Icon(
                                            imageVector = if (isPlayingThis) Icons.Default.Close else Icons.Default.PlayArrow,
                                            contentDescription = null,
                                            tint = PrimaryBlue,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            if (isPlayingThis) "Tinglanmoqda..." else "Ovoz #${index + 1} (${dur}s)",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = NavyDark
                                        )
                                    }

                                    IconButton(
                                        onClick = {
                                            if (playingVoicePath == path) {
                                                voicePlayer.stop()
                                                playingVoicePath = null
                                            }
                                            try { File(path).delete() } catch (_: Exception) {}
                                            recordedVoices.removeAt(index)
                                        },
                                        modifier = Modifier.size(22.dp)
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color(0xFFEF4444), modifier = Modifier.size(14.dp))
                                    }
                                }
                            }
                        }
                    }

                    Button(
                        onClick = {
                            val c = Calendar.getInstance()
                            DatePickerDialog(context, { _, year, month, day ->
                                c.set(Calendar.YEAR, year)
                                c.set(Calendar.MONTH, month)
                                c.set(Calendar.DAY_OF_MONTH, day)
                                TimePickerDialog(context, { _, hour, minute ->
                                    c.set(Calendar.HOUR_OF_DAY, hour)
                                    c.set(Calendar.MINUTE, minute)
                                    selectedCalendarTime = c.timeInMillis
                                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = SlateBg)
                    ) {
                        Icon(Icons.Default.DateRange, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(format.format(Date(selectedCalendarTime)), color = PrimaryBlue, fontSize = 13.sp)
                    }

                    Text("Belgilangan soatdan 30 daqiqa oldin ovozli signal eslatma beriladi.", fontSize = 11.sp, color = TextSecondary)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (title.isBlank() && recordedVoices.isEmpty()) {
                            Toast.makeText(context, "Reja matnini kiriting yoki ovoz yozing!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val base64List = recordedVoices.mapNotNull { (path, _) ->
                            try {
                                val bytes = File(path).readBytes()
                                android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                            } catch (e: Exception) { null }
                        }
                        val finalTitle = title.trim().ifBlank { "Ovozli reja (${base64List.size} ta ovoz)" }
                        val newSchedule = ScheduleItem(
                            id = UUID.randomUUID().toString(),
                            mayorId = currentUser.id,
                            title = finalTitle,
                            location = "",
                            notes = null,
                            scheduledTime = selectedCalendarTime,
                            voiceBase64 = base64List.firstOrNull(),
                            voiceList = base64List
                        )
                        storage.addSchedule(newSchedule)
                        ScheduleScheduler.scheduleReminder(
                            context,
                            newSchedule.id,
                            newSchedule.title,
                            newSchedule.location,
                            newSchedule.notificationTime
                        )
                        voicePlayer.stop()
                        if (isRecordingVoice) scheduleVoiceRecorder.cancelRecording()
                        Toast.makeText(context, "Reja qo'shildi va 30 daqiqa oldingi signal o'rnatildi!", Toast.LENGTH_SHORT).show()
                        showAddDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Saqlash", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    voicePlayer.stop()
                    if (isRecordingVoice) scheduleVoiceRecorder.cancelRecording()
                    showAddDialog = false
                }) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    if (scheduleToDelete != null) {
        AlertDialog(
            onDismissRequest = { scheduleToDelete = null },
            title = { Text("Rejani o'chirish", fontWeight = FontWeight.Bold) },
            text = { Text("\"${scheduleToDelete?.title}\" rejasini bekor qilib o'chirmoqchimisiz?") },
            confirmButton = {
                Button(
                    onClick = {
                        scheduleToDelete?.let { s ->
                            storage.deleteSchedule(s.id)
                            Toast.makeText(context, "Reja bekor qilindi va o'chirildi", Toast.LENGTH_SHORT).show()
                        }
                        scheduleToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("O'chirish", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { scheduleToDelete = null }) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    if (scheduleToEdit != null) {
        val target = scheduleToEdit!!
        var editTitle by remember(target.id) { mutableStateOf(target.title) }
        var editLocation by remember(target.id) { mutableStateOf(target.location) }
        var editNotes by remember(target.id) { mutableStateOf(target.notes ?: "") }
        var editTime by remember(target.id) { mutableLongStateOf(target.scheduledTime) }
        val editFormat = remember { SimpleDateFormat("HH:mm, dd-MM-yyyy", Locale.getDefault()) }

        AlertDialog(
            onDismissRequest = { scheduleToEdit = null },
            title = { Text("Rejani Tahrirlash", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = editTitle,
                        onValueChange = { editTitle = it },
                        label = { Text("Reja nomi *") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4
                    )
                    OutlinedTextField(
                        value = editLocation,
                        onValueChange = { editLocation = it },
                        label = { Text("Joylashuv (Manzil)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = editNotes,
                        onValueChange = { editNotes = it },
                        label = { Text("Qo'shimcha eslatma") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 3
                    )
                    Button(
                        onClick = {
                            val c = Calendar.getInstance().apply { timeInMillis = editTime }
                            DatePickerDialog(context, { _, year, month, day ->
                                c.set(Calendar.YEAR, year)
                                c.set(Calendar.MONTH, month)
                                c.set(Calendar.DAY_OF_MONTH, day)
                                TimePickerDialog(context, { _, hour, minute ->
                                    c.set(Calendar.HOUR_OF_DAY, hour)
                                    c.set(Calendar.MINUTE, minute)
                                    editTime = c.timeInMillis
                                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = SlateBg)
                    ) {
                        Icon(Icons.Default.DateRange, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(editFormat.format(Date(editTime)), color = PrimaryBlue, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (editTitle.isBlank()) {
                            Toast.makeText(context, "Reja matnini kiriting!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val updated = target.copy(
                            title = editTitle.trim(),
                            location = editLocation.trim(),
                            notes = editNotes.trim().ifBlank { null },
                            scheduledTime = editTime
                        )
                        storage.updateSchedule(updated)
                        ScheduleScheduler.scheduleReminder(
                            context,
                            updated.id,
                            updated.title,
                            updated.location,
                            updated.notificationTime
                        )
                        Toast.makeText(context, "Reja muvaffaqiyatli yangilandi!", Toast.LENGTH_SHORT).show()
                        scheduleToEdit = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Saqlash", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { scheduleToEdit = null }) {
                    Text("Bekor qilish")
                }
            }
        )
    }
}

@Composable
fun MayorTasksTab(storage: AppStorage, currentUser: User) {
    val context = LocalContext.current
    val app = context.applicationContext as HokimApp
    val voicePlayer = app.voicePlayer
    var currentlyPlayingVoiceTaskId by remember { mutableStateOf<String?>(null) }
    val tasks by storage.tasks.collectAsState()
    val users by storage.users.collectAsState()
    val mayorTasks = tasks.filter { it.mayorId == currentUser.id }
    val workers = users.filter { it.role == UserRole.WORKER && it.mayorId == currentUser.id }

    var selectedFilterIndex by remember { mutableIntStateOf(0) }
    val filterTabs = listOf("Barchasi", "Boshlanmagan", "Jarayonda", "Bajarildi", "Tekshirildi")

    val now = System.currentTimeMillis()
    val filteredTasks = when (selectedFilterIndex) {
        1 -> mayorTasks.filter { it.status == TaskStatus.PENDING_RED }
        2 -> mayorTasks.filter { it.status == TaskStatus.IN_PROGRESS_YELLOW }
        3 -> mayorTasks.filter { it.status == TaskStatus.COMPLETED_GREEN }
        4 -> mayorTasks.filter { it.status == TaskStatus.INSPECTED_BLUE }
        else -> mayorTasks
    }.sortedWith(
        compareBy<TaskItem> {
            // Faol (boshlanmagan va jarayonda) topshiriqlar eng tepada (0), bajarilganlar esa pastda (1)
            if (it.status == TaskStatus.COMPLETED_GREEN || it.status == TaskStatus.INSPECTED_BLUE) 1 else 0
        }.thenBy {
            // Bajarilish muddati oz qolganlari tepada tursin, ancha vaqt borlari pastida
            it.endDate
        }
    )

    var showCreateTaskDialog by remember { mutableStateOf(false) }
    var taskToEdit by remember { mutableStateOf<TaskItem?>(null) }
    var taskToDelete by remember { mutableStateOf<TaskItem?>(null) }
    var taskSearchQuery by remember { mutableStateOf("") }
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()) }

    val searchedTasks = filteredTasks.filter {
        if (taskSearchQuery.isBlank()) true
        else {
            val q = taskSearchQuery.trim().lowercase()
            it.title.lowercase().contains(q) ||
            it.assignedWorkerName.lowercase().contains(q) ||
            it.description.lowercase().contains(q)
        }
    }

    val voiceRecorder = remember { VoiceRecorder(context) }
    var recordingTaskId by remember { mutableStateOf<String?>(null) }
    var recordingDuration by remember { mutableIntStateOf(0) }
    var pendingRecordTask by remember { mutableStateOf<TaskItem?>(null) }

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            pendingRecordTask?.let { t ->
                val path = voiceRecorder.startRecording()
                if (path != null) {
                    recordingTaskId = t.id
                    recordingDuration = 0
                } else {
                    Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            Toast.makeText(context, "Ovoz yozish uchun mikrofon ruxsati zarur!", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(recordingTaskId) {
        if (recordingTaskId != null) {
            recordingDuration = 0
            while (recordingTaskId != null) {
                delay(1000L)
                recordingDuration++
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            OutlinedTextField(
                value = taskSearchQuery,
                onValueChange = { taskSearchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                placeholder = { Text("Topshiriq yoki mas'ul xodimni qidirish...", fontSize = 12.sp) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(20.dp)
                    )
                },
                trailingIcon = {
                    if (taskSearchQuery.isNotBlank()) {
                        IconButton(onClick = { taskSearchQuery = "" }) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Tozalash",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Color(0xFFCBD5E1)
                )
            )

            ScrollableTabRow(
                selectedTabIndex = selectedFilterIndex,
                containerColor = Color.White,
                contentColor = PrimaryBlue,
                edgePadding = 12.dp
            ) {
                filterTabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedFilterIndex == index,
                        onClick = { selectedFilterIndex = index },
                        text = { Text(title, fontSize = 12.sp, fontWeight = if (selectedFilterIndex == index) FontWeight.Bold else FontWeight.Normal) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (searchedTasks.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Topshiriqlar topilmadi.", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp),
                    contentPadding = PaddingValues(bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(searchedTasks) { task ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    TaskStatusBadge(status = task.status)

                                    val diff = task.endDate - now
                                    val isDone = task.status == TaskStatus.COMPLETED_GREEN || task.status == TaskStatus.INSPECTED_BLUE

                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = "Muddat: " + dateFormat.format(Date(task.endDate)),
                                            fontSize = 11.sp,
                                            color = TextSecondary,
                                            fontWeight = FontWeight.Medium
                                        )
                                        if (!isDone) {
                                            val remainingText = if (diff <= 0) {
                                                "Muddat o'tgan!"
                                            } else {
                                                val totalHours = diff / (1000 * 60 * 60)
                                                val totalMinutes = (diff / (1000 * 60)) % 60
                                                val days = totalHours / 24
                                                val remHours = totalHours % 24
                                                if (days > 0) {
                                                    "${days} kun ${remHours} soat qoldi"
                                                } else if (remHours > 0) {
                                                    "${remHours} soat ${totalMinutes} daq qoldi"
                                                } else {
                                                    "${totalMinutes} daqiqa qoldi"
                                                }
                                            }
                                            val badgeColor = if (diff <= 0) StatusRed else if (diff < 12 * 3600 * 1000L) StatusYellow else PrimaryBlue
                                            Text(
                                                text = remainingText,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = badgeColor
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))
                                
                                val isThisTaskRecording = recordingTaskId == task.id
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        task.title,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = NavyDark,
                                        modifier = Modifier.weight(1f)
                                    )

                                    Spacer(modifier = Modifier.width(8.dp))

                                    // Zvuk, Tahrirlash va Bekor qilish tugmalari
                                    if (!isThisTaskRecording) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(18.dp),
                                                color = Color(0xFFEFF6FF),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBFDBFE)),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(18.dp))
                                                    .clickable {
                                                        if (recordingTaskId != null) {
                                                            Toast.makeText(context, "Avval boshlangan ovoz yozishni yakunlang", Toast.LENGTH_SHORT).show()
                                                            return@clickable
                                                        }
                                                        pendingRecordTask = task
                                                        val hasPermission = ContextCompat.checkSelfPermission(
                                                            context,
                                                            Manifest.permission.RECORD_AUDIO
                                                        ) == PackageManager.PERMISSION_GRANTED

                                                        if (hasPermission) {
                                                            val path = voiceRecorder.startRecording()
                                                            if (path != null) {
                                                                recordingTaskId = task.id
                                                                recordingDuration = 0
                                                            } else {
                                                                Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
                                                            }
                                                        } else {
                                                            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                                        }
                                                    }
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Icon(Icons.Default.Phone, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(13.dp))
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text("Zvuk", color = PrimaryBlue, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }

                                            IconButton(
                                                onClick = { taskToEdit = task },
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                Icon(Icons.Default.Edit, contentDescription = "Tahrirlash", tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                                            }

                                            IconButton(
                                                onClick = { taskToDelete = task },
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                Icon(Icons.Default.Delete, contentDescription = "Bekor qilish", tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
                                            }
                                        }
                                    }
                                }

                                // Ovoz yozish faol holati: To'liq kenglikdagi aniq boshqaruv paneli
                                if (isThisTaskRecording) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFFEF2F2),
                                        border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFFEF4444)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(10.dp)
                                                        .clip(CircleShape)
                                                        .background(Color(0xFFEF4444))
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    text = "Yozilmoqda: ${recordingDuration}s",
                                                    color = Color(0xFFDC2626),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp
                                                )
                                            }

                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                // 1. Agar xato gapirib qo'ysa O'chirish / Bekor qilish tugmasi
                                                Button(
                                                    onClick = {
                                                        voiceRecorder.cancelRecording()
                                                        recordingTaskId = null
                                                        pendingRecordTask = null
                                                        Toast.makeText(context, "Ovoz o'chirildi (bekor qilindi)", Toast.LENGTH_SHORT).show()
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                                    modifier = Modifier.height(34.dp)
                                                ) {
                                                    Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color.White, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("O'chirish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                                }

                                                // 2. Yuborish tugmasi
                                                Button(
                                                    onClick = {
                                                        val result = voiceRecorder.stopRecording()
                                                        recordingTaskId = null
                                                        pendingRecordTask = null
                                                        if (result != null) {
                                                            val (path, durSec) = result
                                                            // 1. Chat orqali xodimga yuborish
                                                            val voiceMsg = ChatMessage(
                                                                id = UUID.randomUUID().toString(),
                                                                senderId = currentUser.id,
                                                                receiverId = task.assignedWorkerId,
                                                                senderName = currentUser.fullName,
                                                                messageType = MessageType.VOICE,
                                                                mediaPath = path,
                                                                audioDurationSec = durSec,
                                                                textContent = "Topshiriq: \"${task.title}\"",
                                                                isRead = false
                                                            )
                                                            storage.sendMessage(voiceMsg)

                                                            // 2. Topshiriqning o'ziga ham ovozni saqlash
                                                            storage.updateTaskVoice(task.id, path, durSec)

                                                            Toast.makeText(context, "${task.assignedWorkerName} ga ovozli topshiriq yuborildi!", Toast.LENGTH_SHORT).show()
                                                        } else {
                                                            Toast.makeText(context, "Ovoz yozilmadi yoki juda qisqa bo'ldi. Qaytadan gapiring.", Toast.LENGTH_SHORT).show()
                                                        }
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                                    modifier = Modifier.height(34.dp)
                                                ) {
                                                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Yuborish", tint = Color.White, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("Yuborish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }
                                }

                                val taskVoices = if (task.voiceList.isNotEmpty()) {
                                    task.voiceList
                                } else if (!task.voiceBase64.isNullOrBlank()) {
                                    listOf(task.voiceBase64!!)
                                } else if (!task.voicePath.isNullOrBlank()) {
                                    listOf(task.voicePath!!)
                                } else {
                                    emptyList()
                                }

                                if (taskVoices.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        taskVoices.forEachIndexed { vIdx, vData ->
                                            val voiceKey = "order_${task.id}_$vIdx"
                                            val isPlayingThisVoice = currentlyPlayingVoiceTaskId == voiceKey
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(8.dp))
                                                        .background(PrimaryBlue.copy(alpha = 0.08f))
                                                        .clickable {
                                                            if (isPlayingThisVoice) {
                                                                voicePlayer.stop()
                                                                currentlyPlayingVoiceTaskId = null
                                                            } else {
                                                                currentlyPlayingVoiceTaskId = voiceKey
                                                                if (vData.length < 256 && File(vData).exists()) {
                                                                    voicePlayer.play(vData) {
                                                                        currentlyPlayingVoiceTaskId = null
                                                                    }
                                                                } else {
                                                                    voicePlayer.playBase64(context, vData, voiceKey) {
                                                                        currentlyPlayingVoiceTaskId = null
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = if (isPlayingThisVoice) Icons.Default.Close else Icons.Default.PlayArrow,
                                                        contentDescription = null,
                                                        tint = PrimaryBlue,
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    val label = if (taskVoices.size > 1) "Ovoz #${vIdx + 1}" else "Ovozli topshiriq"
                                                    Text(
                                                        if (isPlayingThisVoice) "Tinglanmoqda..." else label,
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = PrimaryBlue
                                                    )
                                                }

                                                IconButton(
                                                    onClick = {
                                                        if (isPlayingThisVoice) {
                                                            voicePlayer.stop()
                                                            currentlyPlayingVoiceTaskId = null
                                                        }
                                                        storage.deleteTaskSingleVoice(task.id, vIdx)
                                                        Toast.makeText(context, "Ovoz o'chirildi (topshiriq va chatdan)", Toast.LENGTH_SHORT).show()
                                                    },
                                                    modifier = Modifier.size(28.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Delete,
                                                        contentDescription = "Ovozni o'chirish",
                                                        tint = StatusRed.copy(alpha = 0.8f),
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                if (task.address.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = StatusRed, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(task.address, fontSize = 13.sp, color = NavyDark, fontWeight = FontWeight.SemiBold)
                                    }
                                }

                                if (task.description.isNotBlank()) {
                                    Text(
                                        text = task.description,
                                        fontSize = 13.sp,
                                        color = TextSecondary,
                                        modifier = Modifier.padding(vertical = 6.dp)
                                    )
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                // Birlashtirilgan ixcham Mas'ul va Ko'rildi footer paneli (Web bilan bir xil)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    val assignedWorker = remember(users, task.assignedWorkerId, task.assignedWorkerName) {
                                        users.find { it.id.isNotBlank() && it.id == task.assignedWorkerId }
                                            ?: users.find { it.username.isNotBlank() && it.username.equals(task.assignedWorkerId, ignoreCase = true) }
                                            ?: users.find { it.fullName.isNotBlank() && it.fullName.equals(task.assignedWorkerName.trim(), ignoreCase = true) }
                                            ?: users.find { it.firstName.isNotBlank() && task.assignedWorkerName.contains(it.firstName.trim(), ignoreCase = true) }
                                            ?: users.find { it.lastName.isNotBlank() && task.assignedWorkerName.contains(it.lastName.trim(), ignoreCase = true) }
                                    }
                                    val workerPhone = assignedWorker?.phone?.takeIf { it.isNotBlank() }

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(end = 4.dp)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(SlateBg)
                                                .then(
                                                    if (workerPhone != null) {
                                                        Modifier.clickable {
                                                            try {
                                                                val cleanPhone = workerPhone.filter { it.isDigit() || it == '+' }
                                                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanPhone")).apply {
                                                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                                }
                                                                context.startActivity(intent)
                                                            } catch (e: Exception) {
                                                                Toast.makeText(context, "Qo'ng'iroqni ochib bo'lmadi", Toast.LENGTH_SHORT).show()
                                                            }
                                                        }
                                                    } else Modifier
                                                )
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                task.assignedWorkerName.ifBlank { "Biriktirilmagan" },
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = NavyDark,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }

                                        if (workerPhone != null) {
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = Color(0xFFDCFCE7),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF86EFAC)),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .clickable {
                                                        try {
                                                            val cleanPhone = workerPhone.filter { it.isDigit() || it == '+' }
                                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanPhone")).apply {
                                                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                            }
                                                            context.startActivity(intent)
                                                        } catch (e: Exception) {
                                                            Toast.makeText(context, "Qo'ng'iroqni ochib bo'lmadi", Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp)
                                                ) {
                                                    Icon(Icons.Default.Phone, contentDescription = "Qo'ng'iroq qilish", tint = Color(0xFF15803D), modifier = Modifier.size(12.dp))
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text(workerPhone, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                                }
                                            }
                                        }
                                    }

                                    if (task.seenAt != null) {
                                        val seenTimeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(Color(0xFFDCFCE7))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(12.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                "Ko'rildi: ${seenTimeFormat.format(Date(task.seenAt))}",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF15803D)
                                            )
                                        }
                                    } else {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(Color(0xFFFEF3C7))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Icon(Icons.Default.DateRange, contentDescription = null, tint = Color(0xFFB45309), modifier = Modifier.size(12.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                "Ko'rilmagan",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFFB45309)
                                            )
                                        }
                                    }
                                }

                                if (!task.seenResponseText.isNullOrBlank() || !task.seenResponseVoiceBase64.isNullOrBlank() || !task.seenResponseVoicePath.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color(0xFFF0FDF4))
                                            .padding(horizontal = 8.dp, vertical = 5.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Email, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(12.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Xodim:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        if (!task.seenResponseText.isNullOrBlank()) {
                                            Text(
                                                "\"${task.seenResponseText}\"",
                                                fontSize = 11.sp,
                                                color = NavyDark,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f, fill = false)
                                            )
                                        }
                                        if (!task.seenResponseVoiceBase64.isNullOrBlank() || !task.seenResponseVoicePath.isNullOrBlank()) {
                                            Spacer(modifier = Modifier.width(6.dp))
                                            val isPlayingThis = currentlyPlayingVoiceTaskId == task.id
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .background(Color(0xFFDCFCE7))
                                                    .clickable {
                                                        if (isPlayingThis) {
                                                            voicePlayer.stop()
                                                            currentlyPlayingVoiceTaskId = null
                                                        } else {
                                                            val p = task.seenResponseVoicePath ?: storage.restoreTaskVoiceBase64(task.id, task.seenResponseVoiceBase64 ?: "")
                                                            if (p != null && File(p).exists()) {
                                                                currentlyPlayingVoiceTaskId = task.id
                                                                voicePlayer.play(p) {
                                                                    currentlyPlayingVoiceTaskId = null
                                                                }
                                                            } else {
                                                                Toast.makeText(context, "Ovoz yuklanmoqda...", Toast.LENGTH_SHORT).show()
                                                            }
                                                        }
                                                    }
                                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                                            ) {
                                                Icon(
                                                    imageVector = if (isPlayingThis) Icons.Default.Close else Icons.Default.PlayArrow,
                                                    contentDescription = null,
                                                    tint = Color(0xFF15803D),
                                                    modifier = Modifier.size(14.dp)
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    if (isPlayingThis) "Tinglanmoqda" else "Ovozli javob",
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF15803D)
                                                )
                                            }
                                        }
                                    }
                                }

                                if (!task.completionNotes.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(Color(0xFFE8F5E9))
                                            .padding(8.dp),
                                        verticalAlignment = Alignment.Top
                                    ) {
                                        Icon(Icons.Default.Info, contentDescription = null, tint = StatusGreen, modifier = Modifier.size(16.dp).padding(top = 2.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Column {
                                            Text("Xodim hisoboti / izohi:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StatusGreen)
                                            Text(task.completionNotes, fontSize = 12.sp, color = NavyDark)
                                        }
                                    }
                                }

                                if (task.status == TaskStatus.COMPLETED_GREEN) {
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Button(
                                        onClick = {
                                            storage.updateTaskStatus(task.id, TaskStatus.INSPECTED_BLUE)
                                            Toast.makeText(context, "Topshiriq tekshirildi va tasdiqlandi!", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        colors = ButtonDefaults.buttonColors(containerColor = StatusBlue),
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Borib Tekshirdim (Tasdiqlash)", color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = {
                if (workers.isEmpty()) {
                    Toast.makeText(context, "Avval 'Ishchilar' bo'limidan xodim qo'shing!", Toast.LENGTH_LONG).show()
                } else {
                    showCreateTaskDialog = true
                }
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            containerColor = PrimaryBlue,
            contentColor = Color.White
        ) {
            Icon(Icons.Default.Add, contentDescription = "Topshiriq")
        }
    }

    if (showCreateTaskDialog) {
        CreateTaskDialog(
            workers = workers,
            onDismiss = { showCreateTaskDialog = false },
            onTaskCreated = { title, desc, address, worker, startDate, endDate, voicePath, voiceDurSec ->
                val newTask = TaskItem(
                    id = UUID.randomUUID().toString(),
                    title = title,
                    description = desc,
                    address = address,
                    mayorId = currentUser.id,
                    assignedWorkerId = worker.id,
                    assignedWorkerName = worker.fullName,
                    startDate = startDate,
                    endDate = endDate,
                    status = TaskStatus.PENDING_RED,
                    voicePath = voicePath,
                    voiceDurationSec = voiceDurSec
                )
                storage.addTask(newTask)
                Toast.makeText(context, "${worker.fullName} ga topshiriq biriktirildi!", Toast.LENGTH_SHORT).show()
                showCreateTaskDialog = false
            }
        )
    }

    if (taskToDelete != null) {
        AlertDialog(
            onDismissRequest = { taskToDelete = null },
            title = { Text("Topshiriqni bekor qilish", fontWeight = FontWeight.Bold) },
            text = { Text("\"${taskToDelete?.title}\" topshirig'ini bekor qilib o'chirmoqchimisiz?") },
            confirmButton = {
                Button(
                    onClick = {
                        taskToDelete?.let { t ->
                            storage.deleteTask(t.id)
                            Toast.makeText(context, "Topshiriq bekor qilindi va o'chirildi", Toast.LENGTH_SHORT).show()
                        }
                        taskToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("O'chirish", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { taskToDelete = null }) {
                    Text("Orqaga")
                }
            }
        )
    }

    if (taskToEdit != null) {
        EditTaskDialog(
            task = taskToEdit!!,
            workers = workers,
            onDismiss = { taskToEdit = null },
            onTaskUpdated = { updatedTask ->
                storage.updateTask(updatedTask)
                Toast.makeText(context, "Topshiriq muvaffaqiyatli yangilandi!", Toast.LENGTH_SHORT).show()
                taskToEdit = null
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateTaskDialog(
    workers: List<User>,
    onDismiss: () -> Unit,
    onTaskCreated: (title: String, desc: String, address: String, worker: User, startDate: Long, endDate: Long, voicePath: String?, voiceDurSec: Int) -> Unit
) {
    val context = LocalContext.current
    var title by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var selectedWorker by remember { mutableStateOf(workers.first()) }
    var expanded by remember { mutableStateOf(false) }

    val startCal = remember { Calendar.getInstance() }
    val endCal = remember { Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 2) } }
    var startDateMillis by remember { mutableStateOf(startCal.timeInMillis) }
    var endDateMillis by remember { mutableStateOf(endCal.timeInMillis) }
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()) }

    // Ovozli topshiriq yozish state
    val voiceRecorder = remember { VoiceRecorder(context) }
    val app = context.applicationContext as HokimApp
    val voicePlayer = app.voicePlayer
    var isRecordingVoice by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableIntStateOf(0) }
    var recordedVoicePath by remember { mutableStateOf<String?>(null) }
    var recordedVoiceDuration by remember { mutableIntStateOf(0) }
    var isPlayingVoicePreview by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            val p = voiceRecorder.startRecording()
            if (p != null) {
                isRecordingVoice = true
                recordingDuration = 0
            } else {
                Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(context, "Ovoz yozish uchun mikrofon ruxsati kerak!", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(isRecordingVoice) {
        if (isRecordingVoice) {
            recordingDuration = 0
            while (isRecordingVoice) {
                delay(1000L)
                recordingDuration++
            }
        }
    }

    AlertDialog(
        onDismissRequest = {
            if (isRecordingVoice) voiceRecorder.cancelRecording()
            if (isPlayingVoicePreview) voicePlayer.stop()
            onDismiss()
        },
        title = { Text("Yangi Topshiriq Biriktirish", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Topshiriq matni, manzil va izoh *") },
                    placeholder = { Text("Topshiriq matni, manzil va batafsil izohini shu yerga birgalikda yozing...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6
                )

                // OVOZLI TOPSHIRIQ PANELI
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF8FAFC),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFCBD5E1)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        if (isRecordingVoice) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFFEF4444))
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Yozilmoqda: ${recordingDuration}s", color = Color(0xFFDC2626), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Button(
                                        onClick = {
                                            voiceRecorder.cancelRecording()
                                            isRecordingVoice = false
                                            recordedVoicePath = null
                                            recordedVoiceDuration = 0
                                            Toast.makeText(context, "Ovoz o'chirildi", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color.White, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("O'chirish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }

                                    Button(
                                        onClick = {
                                            val res = voiceRecorder.stopRecording()
                                            isRecordingVoice = false
                                            if (res != null) {
                                                recordedVoicePath = res.first
                                                recordedVoiceDuration = res.second
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Text("To'xtatish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        } else if (recordedVoicePath != null) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(PrimaryBlue.copy(alpha = 0.1f))
                                        .clickable {
                                            if (isPlayingVoicePreview) {
                                                voicePlayer.stop()
                                                isPlayingVoicePreview = false
                                            } else {
                                                isPlayingVoicePreview = true
                                                voicePlayer.play(recordedVoicePath!!) {
                                                    isPlayingVoicePreview = false
                                                }
                                            }
                                        }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Icon(
                                        imageVector = if (isPlayingVoicePreview) Icons.Default.Close else Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        tint = PrimaryBlue,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        if (isPlayingVoicePreview) "Tinglanmoqda..." else "Ovozni eshitish (${recordedVoiceDuration}s)",
                                        color = PrimaryBlue,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }

                                IconButton(
                                    onClick = {
                                        voicePlayer.stop()
                                        isPlayingVoicePreview = false
                                        try { File(recordedVoicePath!!).delete() } catch (_: Exception) {}
                                        recordedVoicePath = null
                                        recordedVoiceDuration = 0
                                    }
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = StatusRed, modifier = Modifier.size(20.dp))
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val hasPerm = ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.RECORD_AUDIO
                                        ) == PackageManager.PERMISSION_GRANTED
                                        if (hasPerm) {
                                            val p = voiceRecorder.startRecording()
                                            if (p != null) {
                                                isRecordingVoice = true
                                                recordingDuration = 0
                                            }
                                        } else {
                                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                        }
                                    }
                                    .padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Phone, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Ovozli topshiriq yozish", color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                        }
                    }
                }


                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    OutlinedTextField(
                        value = selectedWorker.fullName + " (" + (selectedWorker.position ?: "Xodim") + ")",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Biriktiriladigan Mas'ul Xodim *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier
                            .menuAnchor()
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        workers.forEach { worker ->
                            DropdownMenuItem(
                                text = { Text(worker.fullName + " - " + (worker.position ?: "Xodim")) },
                                onClick = {
                                    selectedWorker = worker
                                    expanded = false
                                }
                            )
                        }
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    OutlinedButton(
                        onClick = {
                            val c = Calendar.getInstance().apply { timeInMillis = startDateMillis }
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d, 0, 0, 0)
                                startDateMillis = c.timeInMillis
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Boshlanish sanasi:", fontSize = 10.sp, color = TextSecondary)
                            Text(dateFormat.format(Date(startDateMillis)), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    OutlinedButton(
                        onClick = {
                            val c = Calendar.getInstance().apply { timeInMillis = endDateMillis }
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d, 23, 59, 59)
                                endDateMillis = c.timeInMillis
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Tugash muddati:", fontSize = 10.sp, color = TextSecondary)
                            Text(dateFormat.format(Date(endDateMillis)), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (isRecordingVoice) {
                        val res = voiceRecorder.stopRecording()
                        isRecordingVoice = false
                        if (res != null) {
                            recordedVoicePath = res.first
                            recordedVoiceDuration = res.second
                        }
                    }
                    if (isPlayingVoicePreview) {
                        voicePlayer.stop()
                        isPlayingVoicePreview = false
                    }

                    val finalTitle = when {
                        title.isNotBlank() -> title.trim()
                        recordedVoicePath != null -> "Ovozli topshiriq (${recordedVoiceDuration}s)"
                        else -> {
                            Toast.makeText(context, "Topshiriq matnini kiriting yoki ovoz yozing!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                    }
                    onTaskCreated(finalTitle, description.trim(), address.trim(), selectedWorker, startDateMillis, endDateMillis, recordedVoicePath, recordedVoiceDuration)
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Text("Biriktirish (Qizil)", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = {
                if (isRecordingVoice) voiceRecorder.cancelRecording()
                if (isPlayingVoicePreview) voicePlayer.stop()
                onDismiss()
            }) {
                Text("Bekor qilish")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTaskDialog(
    task: TaskItem,
    workers: List<User>,
    onDismiss: () -> Unit,
    onTaskUpdated: (TaskItem) -> Unit
) {
    val context = LocalContext.current
    var title by remember(task.id) { mutableStateOf(task.title) }
    var address by remember(task.id) { mutableStateOf(task.address) }
    var description by remember(task.id) { mutableStateOf(task.description) }
    var selectedWorker by remember(task.id) {
        mutableStateOf(workers.find { it.id == task.assignedWorkerId } ?: workers.firstOrNull() ?: User(id = task.assignedWorkerId, username = "", password = "", role = UserRole.WORKER, firstName = task.assignedWorkerName, lastName = ""))
    }
    var expanded by remember { mutableStateOf(false) }

    var startDateMillis by remember(task.id) { mutableLongStateOf(task.startDate) }
    var endDateMillis by remember(task.id) { mutableLongStateOf(task.endDate) }
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()) }

    // Ovozli topshiriq yozish state
    val voiceRecorder = remember { VoiceRecorder(context) }
    val app = context.applicationContext as HokimApp
    val voicePlayer = app.voicePlayer
    var isRecordingVoice by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableIntStateOf(0) }
    var recordedVoicePath by remember(task.id) { mutableStateOf(task.voicePath) }
    var recordedVoiceDuration by remember(task.id) { mutableIntStateOf(task.voiceDurationSec) }
    var isPlayingVoicePreview by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            val p = voiceRecorder.startRecording()
            if (p != null) {
                isRecordingVoice = true
                recordingDuration = 0
            } else {
                Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(context, "Ovoz yozish uchun mikrofon ruxsati kerak!", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(isRecordingVoice) {
        if (isRecordingVoice) {
            recordingDuration = 0
            while (isRecordingVoice) {
                delay(1000L)
                recordingDuration++
            }
        }
    }

    AlertDialog(
        onDismissRequest = {
            if (isRecordingVoice) voiceRecorder.cancelRecording()
            if (isPlayingVoicePreview) voicePlayer.stop()
            onDismiss()
        },
        title = { Text("Topshiriqni Tahrirlash", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Topshiriq matni, manzil va izoh *") },
                    placeholder = { Text("Topshiriq matni, manzil va batafsil izohini shu yerga birgalikda yozing...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6
                )

                // OVOZLI TOPSHIRIQ PANELI
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF8FAFC),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFCBD5E1)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        if (isRecordingVoice) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(Color(0xFFEF4444))
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Yozilmoqda: ${recordingDuration}s", color = Color(0xFFDC2626), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Button(
                                        onClick = {
                                            voiceRecorder.cancelRecording()
                                            isRecordingVoice = false
                                            recordedVoicePath = null
                                            recordedVoiceDuration = 0
                                            Toast.makeText(context, "Ovoz o'chirildi", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color.White, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("O'chirish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }

                                    Button(
                                        onClick = {
                                            val res = voiceRecorder.stopRecording()
                                            isRecordingVoice = false
                                            if (res != null) {
                                                recordedVoicePath = res.first
                                                recordedVoiceDuration = res.second
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Text("To'xtatish", fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        } else if (recordedVoicePath != null) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(PrimaryBlue.copy(alpha = 0.1f))
                                        .clickable {
                                            if (isPlayingVoicePreview) {
                                                voicePlayer.stop()
                                                isPlayingVoicePreview = false
                                            } else {
                                                isPlayingVoicePreview = true
                                                voicePlayer.play(recordedVoicePath!!) {
                                                    isPlayingVoicePreview = false
                                                }
                                            }
                                        }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Icon(
                                        imageVector = if (isPlayingVoicePreview) Icons.Default.Close else Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        tint = PrimaryBlue,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        if (isPlayingVoicePreview) "Tinglanmoqda..." else "Ovozni eshitish (${recordedVoiceDuration}s)",
                                        color = PrimaryBlue,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }

                                IconButton(
                                    onClick = {
                                        voicePlayer.stop()
                                        isPlayingVoicePreview = false
                                        try { File(recordedVoicePath!!).delete() } catch (_: Exception) {}
                                        recordedVoicePath = null
                                        recordedVoiceDuration = 0
                                    }
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = StatusRed, modifier = Modifier.size(20.dp))
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val hasPerm = ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.RECORD_AUDIO
                                        ) == PackageManager.PERMISSION_GRANTED
                                        if (hasPerm) {
                                            val p = voiceRecorder.startRecording()
                                            if (p != null) {
                                                isRecordingVoice = true
                                                recordingDuration = 0
                                            }
                                        } else {
                                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                        }
                                    }
                                    .padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Phone, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Ovozli topshiriq yozish", color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                        }
                    }
                }


                if (workers.isNotEmpty()) {
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = !expanded }
                    ) {
                        OutlinedTextField(
                            value = selectedWorker.fullName + " (" + (selectedWorker.position ?: "Xodim") + ")",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Biriktiriladigan Mas'ul Xodim *") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false }
                        ) {
                            workers.forEach { worker ->
                                DropdownMenuItem(
                                    text = { Text(worker.fullName + " - " + (worker.position ?: "Xodim")) },
                                    onClick = {
                                        selectedWorker = worker
                                        expanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    OutlinedButton(
                        onClick = {
                            val c = Calendar.getInstance().apply { timeInMillis = startDateMillis }
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d, 0, 0, 0)
                                startDateMillis = c.timeInMillis
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Boshlanish sanasi:", fontSize = 10.sp, color = TextSecondary)
                            Text(dateFormat.format(Date(startDateMillis)), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    OutlinedButton(
                        onClick = {
                            val c = Calendar.getInstance().apply { timeInMillis = endDateMillis }
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d, 23, 59, 59)
                                endDateMillis = c.timeInMillis
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Tugash muddati:", fontSize = 10.sp, color = TextSecondary)
                            Text(dateFormat.format(Date(endDateMillis)), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (isRecordingVoice) {
                        val res = voiceRecorder.stopRecording()
                        isRecordingVoice = false
                        if (res != null) {
                            recordedVoicePath = res.first
                            recordedVoiceDuration = res.second
                        }
                    }
                    if (isPlayingVoicePreview) {
                        voicePlayer.stop()
                        isPlayingVoicePreview = false
                    }

                    val finalTitle = when {
                        title.isNotBlank() -> title.trim()
                        recordedVoicePath != null -> "Ovozli topshiriq (${recordedVoiceDuration}s)"
                        else -> {
                            Toast.makeText(context, "Topshiriq matnini kiriting yoki ovoz yozing!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                    }
                    val updated = task.copy(
                        title = finalTitle,
                        description = description.trim(),
                        address = address.trim(),
                        assignedWorkerId = selectedWorker.id,
                        assignedWorkerName = selectedWorker.fullName,
                        startDate = startDateMillis,
                        endDate = endDateMillis,
                        voicePath = recordedVoicePath,
                        voiceDurationSec = recordedVoiceDuration
                    )
                    onTaskUpdated(updated)
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Text("Saqlash", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = {
                if (isRecordingVoice) voiceRecorder.cancelRecording()
                if (isPlayingVoicePreview) voicePlayer.stop()
                onDismiss()
            }) {
                Text("Bekor qilish")
            }
        }
    )
}

@Composable
fun MayorWorkersTab(
    storage: AppStorage,
    currentUser: User,
    onOpenChat: (worker: User) -> Unit
) {
    val context = LocalContext.current
    val users by storage.users.collectAsState()
    val tasks by storage.tasks.collectAsState()
    val workers = users.filter { it.role == UserRole.WORKER && it.mayorId == currentUser.id }
    var showAddWorkerDialog by remember { mutableStateOf(false) }
    var editingWorker by remember { mutableStateOf<User?>(null) }
    var sortByRating by remember { mutableStateOf(true) }
    var workerSearchQuery by remember { mutableStateOf("") }

    val rankedWorkers = remember(workers, tasks) {
        RatingCalculator.calculateAllWorkerStats(workers, tasks)
    }

    val displayedWorkers = remember(rankedWorkers, sortByRating) {
        if (sortByRating) rankedWorkers else rankedWorkers.sortedBy { it.first.fullName }
    }

    val searchedWorkers = remember(displayedWorkers, workerSearchQuery) {
        if (workerSearchQuery.isBlank()) displayedWorkers
        else {
            val q = workerSearchQuery.trim().lowercase()
            displayedWorkers.filter { (w, _) ->
                w.fullName.lowercase().contains(q) ||
                (w.position ?: "").lowercase().contains(q)
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header summary card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = NavyDark)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFBBF24), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("XODIMLAR REYTINGI", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                            Text("Hokim tekshirgan har bir ish uchun +0.5 ball", color = TextSecondary, fontSize = 11.sp)
                        }
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = Color(0xFF1E293B)
                        ) {
                            Row(modifier = Modifier.padding(4.dp)) {
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = if (sortByRating) PrimaryBlue else Color.Transparent,
                                    modifier = Modifier.clickable { sortByRating = true }
                                ) {
                                    Text(
                                        "Ball",
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        color = if (sortByRating) Color.White else TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = if (!sortByRating) PrimaryBlue else Color.Transparent,
                                    modifier = Modifier.clickable { sortByRating = false }
                                ) {
                                    Text(
                                        "A-Z",
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        color = if (!sortByRating) Color.White else TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Top 3 Podium
                    if (rankedWorkers.isNotEmpty() && rankedWorkers.any { it.second.score > 0 }) {
                        Spacer(modifier = Modifier.height(14.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.Bottom
                        ) {
                            // 2nd Place
                            if (rankedWorkers.size >= 2 && rankedWorkers[1].second.score > 0) {
                                val second = rankedWorkers[1]
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Surface(shape = CircleShape, color = Color(0xFF94A3B8), modifier = Modifier.size(26.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text("2", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(second.first.firstName, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text("${second.second.score} ball", color = Color(0xFFCBD5E1), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            // 1st Place (Winner)
                            val first = rankedWorkers[0]
                            if (first.second.score > 0) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Surface(shape = CircleShape, color = Color(0xFFF59E0B), modifier = Modifier.size(32.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text("1", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(first.first.firstName, color = Color(0xFFFBBF24), fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                    Text("${first.second.score} / 10 ball", color = Color(0xFFFBBF24), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            // 3rd Place
                            if (rankedWorkers.size >= 3 && rankedWorkers[2].second.score > 0) {
                                val third = rankedWorkers[2]
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Surface(shape = CircleShape, color = Color(0xFFB45309), modifier = Modifier.size(24.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text("3", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(third.first.firstName, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text("${third.second.score} ball", color = Color(0xFFCD7F32), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                "Xodimlar ro'yxati (${workers.size} nafar)",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = NavyDark
            )

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = workerSearchQuery,
                onValueChange = { workerSearchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                placeholder = { Text("Xodimlarni qidirish (ism, lavozim)...", fontSize = 12.sp) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(20.dp)
                    )
                },
                trailingIcon = {
                    if (workerSearchQuery.isNotBlank()) {
                        IconButton(onClick = { workerSearchQuery = "" }) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Tozalash",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Color(0xFFCBD5E1)
                )
            )

            if (searchedWorkers.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Xodimlar topilmadi.", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(searchedWorkers) { (worker, stats) ->
                        val rankIcon = "#${stats.rank}" 

                        val scoreBgColor = when {
                            stats.totalTasks == 0 -> Color(0xFFE2E8F0)
                            stats.score >= 7.5 -> Color(0xFFDCFCE7)
                            stats.score >= 5.0 -> Color(0xFFE0F2FE)
                            stats.score >= 2.5 -> Color(0xFFFEF9C3)
                            stats.score >= 0.5 -> Color(0xFFF1F5F9)
                            else -> Color(0xFFFEE2E2)
                        }

                        val scoreTextColor = when {
                            stats.totalTasks == 0 -> Color(0xFF64748B)
                            stats.score >= 7.5 -> Color(0xFF166534)
                            stats.score >= 5.0 -> Color(0xFF0369A1)
                            stats.score >= 2.5 -> Color(0xFF854D0E)
                            stats.score >= 0.5 -> Color(0xFF475569)
                            else -> Color(0xFF991B1B)
                        }

                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Rank & Avatar
                                    Box(
                                        modifier = Modifier
                                            .size(46.dp)
                                            .clip(CircleShape)
                                            .background(PrimaryBlue.copy(alpha = 0.1f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(rankIcon, fontSize = if (rankIcon.startsWith("#")) 14.sp else 22.sp, fontWeight = FontWeight.Bold, color = PrimaryBlue)
                                    }

                                    Spacer(modifier = Modifier.width(12.dp))

                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                worker.fullName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 15.sp,
                                                color = NavyDark,
                                                modifier = Modifier.weight(1f)
                                            )
                                            // Score Badge
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = scoreBgColor,
                                                modifier = Modifier.padding(start = 6.dp)
                                            ) {
                                                Text(
                                                    if (stats.totalTasks == 0) "0.0 / 10" else "${stats.score} / 10 ball",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 12.sp,
                                                    color = scoreTextColor,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }

                                        Text(
                                            worker.position ?: "Lavozim ko'rsatilmagan",
                                            color = PrimaryBlue,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium
                                        )

                                        if (!worker.phone.isNullOrBlank()) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = Color(0xFFDCFCE7),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF86EFAC)),
                                                modifier = Modifier
                                                    .padding(top = 4.dp, bottom = 2.dp)
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .clickable {
                                                        try {
                                                            val cleanPhone = worker.phone!!.filter { it.isDigit() || it == '+' }
                                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanPhone")).apply {
                                                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                            }
                                                            context.startActivity(intent)
                                                        } catch (e: Exception) {
                                                            Toast.makeText(context, "Qo'ng'iroqni ochib bo'lmadi", Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                ) {
                                                    Icon(Icons.Default.Phone, contentDescription = "Qo'ng'iroq qilish", tint = Color(0xFF15803D), modifier = Modifier.size(13.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text(worker.phone, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                                }
                                            }
                                        }

                                        Text(
                                            "Baholash: ${stats.gradeText}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = scoreTextColor
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))
                                Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                                Spacer(modifier = Modifier.height(8.dp))

                                // Task statistics breakdown
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column {
                                        Text("Tekshirildi: ${stats.inspectedTasks} ta (+${stats.inspectedTasks * 0.5} ball)", fontSize = 11.sp, color = PrimaryBlue, fontWeight = FontWeight.SemiBold)
                                        Text("Erta topshirilgan: ${stats.earlyCompletedTasks}", fontSize = 11.sp, color = Color(0xFF15803D), fontWeight = FontWeight.Medium)
                                    }
                                    Column {
                                        Text("Vaqtida boshlangan: ${stats.earlyStartTasks}", fontSize = 11.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                                        Text("Kechikkan: ${stats.lateCompletedTasks}", fontSize = 11.sp, color = if (stats.lateCompletedTasks > 0) StatusRed else TextSecondary, fontWeight = FontWeight.Medium)
                                    }
                                }

                                // Inactivity penalty alert
                                Spacer(modifier = Modifier.height(6.dp))
                                if (stats.hasLoggedIn) {
                                    if (stats.daysInactive >= 2L) {
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFFEF2F2),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(
                                                "Ilovaga ${stats.daysInactive} kundan beri kirmagan (-${stats.inactivityPenalty} ball jarima)",
                                                fontSize = 11.sp,
                                                color = StatusRed,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    } else if (stats.daysInactive == 1L) {
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFFEF9C3),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(
                                                "Kecha kirgan (Bugun hali kirmagan)",
                                                fontSize = 11.sp,
                                                color = Color(0xFF854D0E),
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    } else {
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFF0FDF4),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text(
                                                "Bugun ilovada faol bo'lgan",
                                                fontSize = 11.sp,
                                                color = Color(0xFF166534),
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }
                                } else {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Color(0xFFF8FAFC),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(
                                            "Yangi biriktirilgan (Hali ilovaga kirmagan)",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B),
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(6.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        if (!worker.phone.isNullOrBlank()) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = Color(0xFFDCFCE7),
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF86EFAC)),
                                                modifier = Modifier
                                                    .padding(bottom = 4.dp)
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .clickable {
                                                        try {
                                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${worker.phone.trim()}"))
                                                            context.startActivity(intent)
                                                        } catch (e: Exception) {
                                                            Toast.makeText(context, "Qo'ng'iroqni ochib bo'lmadi", Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                ) {
                                                    Icon(Icons.Default.Phone, contentDescription = "Qo'ng'iroq qilish", tint = Color(0xFF15803D), modifier = Modifier.size(12.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text(worker.phone, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                                }
                                            }
                                        }
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(top = 2.dp)
                                        ) {
                                            Text("Login: ", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextSecondary)
                                            Text(worker.username, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Parol: ", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextSecondary)
                                            Text(worker.password, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
                                        }
                                    }

                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(
                                            onClick = { editingWorker = worker },
                                            modifier = Modifier
                                                .size(36.dp)
                                                .background(Color(0xFFF1F5F9), CircleShape)
                                        ) {
                                            Icon(Icons.Default.Edit, contentDescription = "Tahrirlash", tint = NavyDark, modifier = Modifier.size(17.dp))
                                        }
                                        Spacer(modifier = Modifier.width(6.dp))
                                        IconButton(
                                            onClick = { onOpenChat(worker) },
                                            modifier = Modifier
                                                .size(36.dp)
                                                .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape)
                                        ) {
                                            Icon(Icons.Default.Email, contentDescription = "Chat", tint = PrimaryBlue, modifier = Modifier.size(18.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { showAddWorkerDialog = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp),
            containerColor = PrimaryBlue,
            contentColor = Color.White
        ) {
            Icon(Icons.Default.Add, contentDescription = "Ishchi qo'shish")
        }
    }

    if (showAddWorkerDialog) {
        var firstName by remember { mutableStateOf("") }
        var lastName by remember { mutableStateOf("") }
        var position by remember { mutableStateOf("") }
        var phone by remember { mutableStateOf("") }
        var note by remember { mutableStateOf("") }
        var newUsername by remember { mutableStateOf("") }
        var newPassword by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showAddWorkerDialog = false },
            title = { Text("Yangi Ishchi Qo'shish", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text("Ism *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = { Text("Familiya *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = position,
                        onValueChange = { position = it },
                        label = { Text("Lavozimi / Ishlash joyi *") },
                        placeholder = { Text("Masalan: Yo'l ta'mirlash boshlig'i") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Telefon raqami (Ixtiyoriy)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        label = { Text("Ishchi haqida izoh") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newUsername,
                        onValueChange = { newUsername = it },
                        label = { Text("Tizimga kirish uchun Login *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = { Text("Tizimga kirish uchun Parol *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (firstName.isBlank() || position.isBlank() || newUsername.isBlank() || newPassword.isBlank()) {
                            Toast.makeText(context, "Yulduzcha (*) bilan belgilangan maydonlarni to'ldiring!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val newWorker = User(
                            id = UUID.randomUUID().toString(),
                            username = newUsername.trim(),
                            password = newPassword.trim(),
                            role = UserRole.WORKER,
                            firstName = firstName.trim(),
                            lastName = lastName.trim(),
                            phone = phone.trim().ifBlank { null },
                            position = position.trim(),
                            note = note.trim().ifBlank { null },
                            mayorId = currentUser.id
                        )
                        storage.addUser(newWorker)
                        Toast.makeText(context, "Yangi ishchi qo'shildi va chat ochildi!", Toast.LENGTH_SHORT).show()
                        showAddWorkerDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Qo'shish", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddWorkerDialog = false }) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    if (editingWorker != null) {
        val worker = editingWorker!!
        var wFirstName by remember(worker.id) { mutableStateOf(worker.firstName ?: "") }
        var wLastName by remember(worker.id) { mutableStateOf(worker.lastName ?: "") }
        var wPosition by remember(worker.id) { mutableStateOf(worker.position ?: "") }
        var wPhone by remember(worker.id) { mutableStateOf(worker.phone ?: "") }
        var wUsername by remember(worker.id) { mutableStateOf(worker.username) }
        var wPassword by remember(worker.id) { mutableStateOf(worker.password) }
        var isWPasswordVisible by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { editingWorker = null },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Edit, contentDescription = null, tint = PrimaryBlue)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Xodimni Tahrirlash", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState())
                ) {
                    OutlinedTextField(
                        value = wFirstName,
                        onValueChange = { wFirstName = it },
                        label = { Text("Ism *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = wLastName,
                        onValueChange = { wLastName = it },
                        label = { Text("Familiya") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = wPosition,
                        onValueChange = { wPosition = it },
                        label = { Text("Lavozimi *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = wPhone,
                        onValueChange = { wPhone = it },
                        label = { Text("Telefon raqami") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = wUsername,
                        onValueChange = { wUsername = it },
                        label = { Text("Login *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = wPassword,
                        onValueChange = { wPassword = it },
                        label = { Text("Parol *") },
                        singleLine = true,
                        visualTransformation = if (isWPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isWPasswordVisible = !isWPasswordVisible }) {
                                Icon(
                                    imageVector = if (isWPasswordVisible) Icons.Default.Lock else Icons.Default.Info,
                                    contentDescription = "Ko'rsatish/Yashirish"
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val fn = wFirstName.trim()
                        val pos = wPosition.trim()
                        val u = wUsername.trim()
                        val p = wPassword.trim()
                        if (fn.isBlank() || pos.isBlank() || u.isBlank() || p.isBlank()) {
                            Toast.makeText(context, "Yulduzcha (*) maydonlarni to'ldiring!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val exists = storage.users.value.any { it.id != worker.id && it.username.equals(u, ignoreCase = true) }
                        if (exists) {
                            Toast.makeText(context, "Bu login boshqa foydalanuvchi tomonidan band qilingan!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val updated = worker.copy(
                            firstName = fn,
                            lastName = wLastName.trim(),
                            position = pos,
                            phone = wPhone.trim().ifBlank { null },
                            username = u,
                            password = p
                        )
                        storage.updateUser(updated)
                        Toast.makeText(context, "Xodim ma'lumotlari yangilandi!", Toast.LENGTH_SHORT).show()
                        editingWorker = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Saqlash", color = Color.White)
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { editingWorker = null }) {
                    Text("Bekor qilish")
                }
            }
        )
    }
}

@Composable
fun MayorChatsTab(
    storage: AppStorage,
    currentUser: User,
    onOpenChat: (worker: User) -> Unit
) {
    val users by storage.users.collectAsState()
    val messages by storage.messages.collectAsState()
    val workers = users.filter { it.role == UserRole.WORKER && it.mayorId == currentUser.id }
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Ishchilar bilan Muloqot (Telegram kabi)", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)
        Text("Har bir ishchi qo'shilishi bilanoq ushbu ro'yxatda paydo bo'ladi.", fontSize = 12.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(12.dp))

        if (workers.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Chatlashish uchun hali xodimlar qo'shilmagan.", color = TextSecondary)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(workers) { worker ->
                    val lastMessage = messages.filter {
                        (it.senderId == currentUser.id && it.receiverId == worker.id) ||
                        (it.senderId == worker.id && it.receiverId == currentUser.id)
                    }.maxByOrNull { it.timestamp }

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenChat(worker) },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(50.dp)
                                    .clip(CircleShape)
                                    .background(PrimaryBlue),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = worker.firstName.take(1).uppercase() + (worker.lastName.take(1).uppercase()),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(worker.fullName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NavyDark)
                                    if (lastMessage != null) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            if (lastMessage.senderId == currentUser.id) {
                                                val isRead = lastMessage.isDeliveredAndRead
                                                Icon(
                                                    imageVector = if (isRead) Icons.Default.Done else Icons.Default.Done,
                                                    contentDescription = null,
                                                    tint = if (isRead) Color(0xFF0284C7) else Color(0xFF94A3B8),
                                                    modifier = Modifier.size(14.dp)
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                            }
                                            Text(timeFormat.format(Date(lastMessage.timestamp)), fontSize = 11.sp, color = TextSecondary)
                                        }
                                    }
                                }

                                Text(
                                    text = worker.position ?: "Xodim",
                                    fontSize = 12.sp,
                                    color = PrimaryBlue,
                                    fontWeight = FontWeight.Medium
                                )

                                val previewText = when {
                                    lastMessage == null -> "Muloqotni boshlang..."
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.VOICE -> "Ovozli xabar (" + lastMessage.audioDurationSec + " sek)"
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.IMAGE -> "Rasm"
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.VIDEO -> "Video"
                                    else -> lastMessage.textContent ?: ""
                                }

                                Text(
                                    text = previewText,
                                    fontSize = 13.sp,
                                    color = TextSecondary,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

data class AiTaskDraft(
    val title: String = "",
    val worker: User? = null,
    val startDate: Long = System.currentTimeMillis(),
    val endDate: Long = System.currentTimeMillis() + 48 * 3600 * 1000L
)

@Composable
fun AiJarvisFloatingOrb(
    storage: AppStorage,
    currentUser: User,
    onDismiss: () -> Unit,
    onSwitchTab: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val users by storage.users.collectAsState()
    val workers = users.filter { it.role == UserRole.WORKER && it.mayorId == currentUser.id }

    var inputText by remember { mutableStateOf("") }
    var isListening by remember { mutableStateOf(false) }
    var isSpeaking by remember { mutableStateOf(false) }
    var aiState by remember { mutableStateOf("IDLE") }
    var draftTask by remember { mutableStateOf(AiTaskDraft()) }

    val conversationHistory = remember {
        mutableStateListOf(
            "JARVIS" to "Assalomu alaykum! Men sizning sun'iy intellekt yordamchingizman. Topshiriq biriktirish, rejalarni ochish yoki xodimlarni saralash bo'yicha buyruq berishingiz mumkin."
        )
    }

    var tts: TextToSpeech? by remember { mutableStateOf(null) }
    var activePlayer by remember { mutableStateOf<android.media.MediaPlayer?>(null) }

    LaunchedEffect(Unit) {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val uzLocale = Locale("uz", "UZ")
                val res = tts?.setLanguage(uzLocale)
                if (res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts?.language = uzLocale
                }
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            try {
                activePlayer?.stop()
                activePlayer?.release()
            } catch (_: Exception) {}
            tts?.stop()
            tts?.shutdown()
        }
    }

    fun speak(text: String) {
        val cleanText = text.trim()
        if (cleanText.isBlank()) return

        isSpeaking = true

        try {
            activePlayer?.stop()
            activePlayer?.release()
        } catch (_: Exception) {}

        try {
            val encoded = java.net.URLEncoder.encode(cleanText, "UTF-8")
            val ttsUrl = "https://hokim.vercel.app/api/tts?text=$encoded"
            val player = android.media.MediaPlayer().apply {
                setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .build()
                )
                setDataSource(ttsUrl)
                setOnPreparedListener {
                    start()
                }
                setOnCompletionListener {
                    isSpeaking = false
                    release()
                    activePlayer = null
                }
                setOnErrorListener { _, _, _ ->
                    // Faqat va faqat O'zbek tili! Begona tillarda gapirmaydi
                    val uzLocale = Locale("uz", "UZ")
                    val isUzAvailable = (tts?.isLanguageAvailable(uzLocale) ?: -1) >= TextToSpeech.LANG_AVAILABLE
                    if (isUzAvailable) {
                        tts?.language = uzLocale
                        tts?.speak(cleanText, TextToSpeech.QUEUE_FLUSH, null, "AI_JARVIS_UTT")
                    } else {
                        isSpeaking = false
                    }
                    release()
                    activePlayer = null
                    true
                }
                prepareAsync()
            }
            activePlayer = player
        } catch (e: Exception) {
            val uzLocale = Locale("uz", "UZ")
            val isUzAvailable = (tts?.isLanguageAvailable(uzLocale) ?: -1) >= TextToSpeech.LANG_AVAILABLE
            if (isUzAvailable) {
                tts?.language = uzLocale
                tts?.speak(cleanText, TextToSpeech.QUEUE_FLUSH, null, "AI_JARVIS_UTT")
            } else {
                isSpeaking = false
            }
        }
    }

    fun stopSpeaking() {
        try {
            activePlayer?.stop()
            activePlayer?.release()
        } catch (_: Exception) {}
        activePlayer = null
        try {
            tts?.stop()
        } catch (_: Exception) {}
        isSpeaking = false
    }

    val speechLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        isListening = false
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!spoken.isNullOrBlank()) {
                stopSpeaking()
                inputText = spoken
            }
        }
    }

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            stopSpeaking()
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "uz-UZ")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "uz-UZ")
                putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "O'zbek tilida buyruq bering...")
            }
            try {
                isListening = true
                speechLauncher.launch(intent)
            } catch (e: Exception) {
                isListening = false
                Toast.makeText(context, "Ovozli qidiruv mavjud emas", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(context, "Mikrofon ruxsati berilmadi", Toast.LENGTH_SHORT).show()
        }
    }

    fun handleCommand(rawCmd: String) {
        val cmd = rawCmd.trim()
        if (cmd.isBlank()) return

        // Shovqin filtri: Faqat sonlardan iborat bo'lsa (masalan: 30224030224) e'tiborsiz qoldiriladi
        if (cmd.matches(Regex("^\\d+$"))) return

        conversationHistory.add("USER" to cmd)
        inputText = ""

        val lower = cmd.lowercase()
            .replace('\u02BB', '\'')
            .replace('\u02BC', '\'')
            .replace('\u2018', '\'')
            .replace('\u2019', '\'')
            .replace('\u0060', '\'')
            .trim()

        // 0. To'xtatish va o'zini o'zi yopish ("to'xta", "stop", "jim", "bas", "yetadi", "yopil", "chiq")
        val stopWords = listOf("to'xta", "toxta", "to'xtat", "toxtat", "jim bo'l", "jim bol", "jim", "bas", "yetadi", "yopil", "yop", "chiq", "stop", "xayr")
        if (stopWords.any { lower == it || lower.startsWith("$it ") || lower.endsWith(" $it") || lower.contains(" $it ") }) {
            aiState = "IDLE"
            val reply = "Tushundim, to'xtadim."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            onDismiss()
            return
        }

        // 1. Tasdiqlash bosqichi (CONFIRMING)
        if (aiState == "CONFIRMING") {
            val confirmWords = listOf(
                "ha", "xa", "albatta", "bo'ldi", "boldi", "to'g'ri", "tasdiqlayman", "tasdiqla",
                "saqla", "saqlab qo'y", "saqlansin", "yubor", "tamom", "tayyor", "yaxshi",
                "ok", "yes", "shunday", "etdim", "yetadi", "da", "podtverjdayu", "davay", "ladno", "bajarilsin"
            )
            if (confirmWords.any { lower == it || lower.startsWith("$it ") || lower.endsWith(" $it") || lower.contains(" $it ") }) {
                draftTask.worker?.let { w ->
                    val newTask = TaskItem(
                        id = UUID.randomUUID().toString(),
                        title = draftTask.title,
                        description = "",
                        address = "",
                        mayorId = currentUser.id,
                        assignedWorkerId = w.id,
                        assignedWorkerName = w.fullName,
                        startDate = draftTask.startDate,
                        endDate = draftTask.endDate,
                        status = TaskStatus.PENDING_RED
                    )
                    storage.addTask(newTask)
                    aiState = "IDLE"
                    val reply = "${w.fullName} ga topshiriq muvaffaqiyatli biriktirildi va saqlandi!"
                    conversationHistory.add("JARVIS" to reply)
                    speak(reply)
                    Toast.makeText(context, reply, Toast.LENGTH_SHORT).show()
                }
                return
            } else if (lower.contains("yo'q") || lower.contains("yoq") || lower.contains("bekor") || lower.contains("kerakmas")) {
                aiState = "IDLE"
                val reply = "Topshiriq bekor qilindi."
                conversationHistory.add("JARVIS" to reply)
                speak(reply)
                return
            } else if (lower.contains("xatosi") || lower.contains("duzot") || lower.contains("tuzat") || lower.contains("emas") || lower.contains("o'rniga") || lower.contains("o'zgartir") || lower.contains("xato")) {
                val otherWorker = workers.firstOrNull { w ->
                    val f = w.firstName.lowercase()
                    val l = w.lastName.lowercase()
                    (f.length > 2 && lower.contains(f)) || (l.length > 2 && lower.contains(l))
                }
                if (otherWorker != null) {
                    draftTask = draftTask.copy(worker = otherWorker)
                }
                val reply = "Tuzatildi. Mas'ul: ${draftTask.worker?.fullName ?: "xodim"}. Topshiriqni saqlash va biriktirishni tasdiqlaysizmi?"
                conversationHistory.add("JARVIS" to reply)
                speak(reply)
                return
            }
        }

        // 2. Ma'lumotlarni yig'ish bosqichi (DRAFTING)
        if (aiState == "DRAFTING") {
            if (lower.contains("yo'q") || lower.contains("yoq") || lower.contains("bekor") || lower.contains("kerakmas")) {
                aiState = "IDLE"
                val reply = "Topshiriq bekor qilindi."
                conversationHistory.add("JARVIS" to reply)
                speak(reply)
                return
            }

            val worker = workers.firstOrNull { w ->
                val f = w.firstName.lowercase()
                val l = w.lastName.lowercase()
                (f.length > 2 && lower.contains(f)) || (l.length > 2 && lower.contains(l))
            }
            if (worker != null) {
                draftTask = draftTask.copy(worker = worker)
            } else if (lower.contains("kirgizmay") || lower.contains("bo'ldi") || lower.contains("boldi") || lower.contains("kerakmas")) {
                if (draftTask.worker == null && workers.isNotEmpty()) {
                    draftTask = draftTask.copy(worker = workers.first())
                }
            }

            if (draftTask.worker != null) {
                aiState = "CONFIRMING"
                val df = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
                val reply = "${draftTask.worker?.fullName} ga \"${draftTask.title}\" topshirig'i tayyorlandi. Muddati: ${df.format(Date(draftTask.endDate))}. Topshiriqni tasdiqlaysizmi?"
                conversationHistory.add("JARVIS" to reply)
                speak(reply)
                return
            } else {
                val reply = "Topshiriq: \"${draftTask.title}\". Bu topshiriqni qaysi xodimga biriktiramiz?"
                conversationHistory.add("JARVIS" to reply)
                speak(reply)
                return
            }
        }

        // 2.9 Barcha topshiriqlarni chiqarish / ko'rsatish
        if (lower.contains("barcha topshiriq") || lower.contains("hamma topshiriq") || lower.contains("barcha vazifa") ||
            lower.contains("topshiriqlarni chiqar") || lower.contains("topshiriqni chiqar") || lower.contains("hammasini chiqar") ||
            lower.contains("barchasini ko'rsat") || lower.contains("barchasini chiqar") || lower == "hammasi" || lower == "barchasi") {
            onSwitchTab(0)
            val reply = "Barcha topshiriqlar ro'yxati ochildi."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            return
        }

        // 3. Sahifalarga o'tish (Aniq navigatsiya)
        // Tab 0: Topshiriqlar
        if (Regex("\\b(?:1[- ]?(?:pej|sahifa|peyj|page|vkladka|bo'lim|bolim)|birinchi\\s+(?:pej|sahifa|pejni|page|bo'lim|bolim)|topshiriqlar|bosh\\s+sahifa|asosiy|glavniy)\\b", RegexOption.IGNORE_CASE).containsMatchIn(lower) ||
            (lower.contains("topshiriq") && (lower.contains("och") || lower.contains("o't") || lower.contains("ot") || lower.contains("chiqar") || lower.contains("ko'rsat") || lower.contains("sahifa") || lower.contains("bo'lim") || lower.contains("bolim")))) {
            onSwitchTab(0)
            val reply = "1-sahifa: Topshiriqlar bo'limi ochildi."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            return
        }

        // Tab 1: Rejalar
        if (Regex("\\b(?:2[- ]?(?:pej|sahifa|peyj|page|vkladka|bo'lim|bolim)|ikkinchi\\s+(?:pej|sahifa|pejni|page|bo'lim|bolim)|reja|rejalar|rejani|rejalarni|plan|kalendar)\\b", RegexOption.IGNORE_CASE).containsMatchIn(lower) ||
            (lower.contains("reja") && (lower.contains("och") || lower.contains("o't") || lower.contains("ot") || lower.contains("chiqar") || lower.contains("ko'rsat") || lower.contains("sahifa") || lower.contains("bo'lim") || lower.contains("bolim")))) {
            onSwitchTab(1)
            val reply = "2-sahifa: Rejalar bo'limi ochildi."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            return
        }

        // Tab 2: Xodimlar va reyting
        if (Regex("\\b(?:3[- ]?(?:pej|sahifa|peyj|page|vkladka|bo'lim|bolim)|uchinchi\\s+(?:pej|sahifa|pejni|page|bo'lim|bolim)|xodim|xodimlar|xodimlarni|ishchi|ishchilar|ishchilarni|reyting|reytingni)\\b", RegexOption.IGNORE_CASE).containsMatchIn(lower) ||
            ((lower.contains("xodim") || lower.contains("ishchi")) && (lower.contains("och") || lower.contains("o't") || lower.contains("ot") || lower.contains("chiqar") || lower.contains("ko'rsat") || lower.contains("sahifa") || lower.contains("bo'lim") || lower.contains("bolim")))) {
            onSwitchTab(2)
            val reply = "3-sahifa: Xodimlar va ularning reytingi sahifasiga o'tdik."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            return
        }

        // Tab 3: Chatlar
        if (Regex("\\b(?:4[- ]?(?:pej|sahifa|peyj|page|vkladka|bo'lim|bolim)|to['ʻ`]?rtinchi\\s+(?:pej|sahifa|pejni|page|bo'lim|bolim)|chat|chatlar|chatlarni|xabar|xabarlar|xabarlarni)\\b", RegexOption.IGNORE_CASE).containsMatchIn(lower) ||
            ((lower.contains("chat") || lower.contains("xabar")) && (lower.contains("och") || lower.contains("o't") || lower.contains("ot") || lower.contains("chiqar") || lower.contains("ko'rsat") || lower.contains("sahifa") || lower.contains("bo'lim") || lower.contains("bolim")))) {
            onSwitchTab(3)
            val reply = "4-sahifa: Chatlar bo'limi ochildi."
            conversationHistory.add("JARVIS" to reply)
            speak(reply)
            return
        }

        // 4. Yangi topshiriq yaratish ("ish ber", "topshiriq ber", "vazifa", "asfaltlash", "kerak")
        val isCreate = lower.contains("ish ber") || lower.contains("topshiriq ber") || lower.contains("yangi topshiriq") || lower.contains("vazifa ber") || lower.contains("biriktir") || lower.contains("kerak") || lower.contains("asfaltlash") || lower.contains("tozalash") || lower.contains("yarat")
        val detectedWorker = workers.firstOrNull { w ->
            val f = w.firstName.lowercase().replace('\u02BB', '\'').replace('\u2018', '\'').replace('\u2019', '\'')
            val l = w.lastName.lowercase().replace('\u02BB', '\'').replace('\u2018', '\'').replace('\u2019', '\'')
            (f.length > 2 && lower.contains(f)) || (l.length > 2 && lower.contains(l))
        }

        if (isCreate || detectedWorker != null) {
            val now = System.currentTimeMillis()
            val end = now + 48 * 3600 * 1000L
            val df = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())

            var cleanTitle = cmd
                .replace(Regex("(?i)valiga|alisherga|karimga|boburga|jamshidga|xodimga"), "")
                .replace(Regex("(?i)ish ber|topshiriq ber|yangi topshiriq|vazifa ber|biriktir|qilsin|etsin|tekshirsin|bajarilsin|kerak|yarat"), "")
                .replace(Regex("(?i)\\d{1,2}[-–\\s]*(sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust)[gacha]*"), "")
                .replace(Regex("(?i)bugun|ertaga|indin|gacha"), "")
                .replace(Regex("[,;:.!?]"), " ")
                .trim()

            if (cleanTitle.length < 3) cleanTitle = "Topshiriq ijrosini ta'minlash"
            cleanTitle = cleanTitle.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }

            if (detectedWorker != null) {
                draftTask = AiTaskDraft(
                    title = cleanTitle,
                    worker = detectedWorker,
                    startDate = now,
                    endDate = end
                )
                aiState = "CONFIRMING"

                val promptSpeech = "${detectedWorker.fullName} ga \"${cleanTitle}\" topshirig'i tayyorlandi. Boshlanish sanasi: ${df.format(Date(now))}, tugash muddati: ${df.format(Date(end))}. Bu ishchi reytingiga ta'sir qiladi. Topshiriqni saqlash va biriktirishni tasdiqlaysizmi?"
                conversationHistory.add("JARVIS" to promptSpeech)
                speak(promptSpeech)
                return
            } else {
                draftTask = AiTaskDraft(
                    title = cleanTitle,
                    worker = null,
                    startDate = now,
                    endDate = end
                )
                aiState = "DRAFTING"

                val promptSpeech = "Xo'p, tushunarli. Topshiriq: \"${cleanTitle}\". Bu topshiriqni qaysi xodimga biriktiramiz va muddati qachongacha?"
                conversationHistory.add("JARVIS" to promptSpeech)
                speak(promptSpeech)
                return
            }
        }

        // Tushunarsiz buyruq: Hech qachon "Kechirasiz" yoki xatolik aytilmaydi, har doim faol tayyorlik bildiriladi!
        val fallback = "Topshiriq, reja, xodimlar yoki chatlar bo'yicha buyrug'ingizni bering, darhol bajaraman."
        conversationHistory.add("JARVIS" to fallback)
        speak(fallback)
    }

    var lastCaption by remember {
        mutableStateOf("Buyrug'ingizni ayting...")
    }

    val infiniteTransition = rememberInfiniteTransition(label = "aiOrbAnim")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (isListening) 4000 else 8000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "orbRotation"
    )
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = if (isListening) 1.12f else 1.04f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (isListening) 1200 else 2400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "orbScale"
    )
    val cornerRadiusPercent by infiniteTransition.animateFloat(
        initialValue = 50f, // 1. Tomoloq
        targetValue = 22f, // 2. 5/8 burchak geometrik
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "orbMorph"
    )

    LaunchedEffect(inputText) {
        if (inputText.isNotBlank()) {
            lastCaption = "\"$inputText\""
            handleCommand(inputText)
        }
    }

    // Apple Siri Style Pure Floating Morphing Orb (Faqatgina harakatlanuvchi shar, ortiqcha detallarsiz)
    Box(
        modifier = modifier
            .size(76.dp),
        contentAlignment = Alignment.Center
    ) {
        // Outer glow halo 1
        Box(
            modifier = Modifier
                .size(76.dp)
                .scale(scale * 1.05f)
                .clip(CircleShape)
                .background(Color(0x336366F1))
        )
        // Outer glow halo 2
        Box(
            modifier = Modifier
                .size(64.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(Color(0x443B82F6))
        )

        // Core Morphing Orb (Tomoloq -> 5 burchak -> 8 burchak -> Tomoloq)
        Box(
            modifier = Modifier
                .size(54.dp)
                .scale(scale)
                .rotate(rotation)
                .clip(RoundedCornerShape(percent = cornerRadiusPercent.toInt()))
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color.White,
                            Color(0xFFBFDBFE),
                            Color(0xFF6366F1),
                            Color(0xFF3B82F6),
                            Color(0xFF1E1B4B)
                        ),
                        center = Offset(36f, 20f),
                        radius = 70f
                    )
                )
                .clickable {
                    stopSpeaking()
                    val hasPerm = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                    if (hasPerm) {
                        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "uz-UZ")
                            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "uz-UZ")
                            putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
                            putExtra(RecognizerIntent.EXTRA_PROMPT, "O'zbek tilida buyruq bering...")
                        }
                        try {
                            isListening = true
                            speechLauncher.launch(intent)
                        } catch (e: Exception) {
                            isListening = false
                            Toast.makeText(context, "Ovozli qidiruv mavjud emas", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
        )
    }
}
