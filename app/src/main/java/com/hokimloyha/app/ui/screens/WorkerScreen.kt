package com.hokimloyha.app.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.model.ChatMessage
import com.hokimloyha.app.model.MessageType
import com.hokimloyha.app.model.TaskItem
import com.hokimloyha.app.model.TaskStatus
import com.hokimloyha.app.model.User
import com.hokimloyha.app.service.NotificationHelper
import com.hokimloyha.app.ui.components.TaskStatusBadge
import com.hokimloyha.app.ui.theme.*
import com.hokimloyha.app.util.RatingCalculator
import com.hokimloyha.app.util.WorkerStats
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.hokimloyha.app.HokimApp
import com.hokimloyha.app.service.VoiceRecorder
import com.hokimloyha.app.service.VoicePlayer
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import java.io.File
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun WorkerScreen(
    storage: AppStorage,
    currentUser: User,
    onOpenChat: (mayor: User) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
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
    val users by storage.users.collectAsState()
    val mayor = users.find { it.id == currentUser.mayorId } ?: users.find { it.role == com.hokimloyha.app.model.UserRole.MAYOR }

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
                                .background(Color(0xFF0284C7)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Person, contentDescription = null, tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(currentUser.fullName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(currentUser.position ?: "Mas'ul Xodim", color = TextSecondary, fontSize = 12.sp)
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { showProfileDialog = true }) {
                            Icon(Icons.Default.AccountCircle, contentDescription = "Profil va Parol", tint = Color.White)
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
                    label = { Text("Topshiriqlarim", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = {
                        if (mayor != null) {
                            onOpenChat(mayor)
                        } else {
                            Toast.makeText(context, "Hokim ma'lumoti topilmadi", Toast.LENGTH_SHORT).show()
                        }
                    },
                    icon = { Icon(Icons.Default.Email, contentDescription = null) },
                    label = { Text("Hokim bilan Chat", fontSize = 11.sp) }
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
            WorkerTasksView(storage = storage, currentUser = currentUser, mayor = mayor)
        }
    }

    if (showProfileDialog) {
        var myUsername by remember { mutableStateOf(currentUser.username) }
        var myPassword by remember { mutableStateOf(currentUser.password) }
        var isPasswordVisible by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { showProfileDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF0284C7))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Profil va Kirish Ma'lumotlari", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(currentUser.fullName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NavyDark)
                            Text(currentUser.position ?: "Mas'ul Xodim", fontSize = 12.sp, color = Color(0xFF0284C7))
                        }
                    }

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
                        val u = myUsername.trim()
                        val p = myPassword.trim()
                        if (u.isBlank() || p.isBlank()) {
                            Toast.makeText(context, "Login va parolni kiriting!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val exists = storage.users.value.any { it.id != currentUser.id && it.username.equals(u, ignoreCase = true) }
                        if (exists) {
                            Toast.makeText(context, "Bu login boshqa foydalanuvchi tomonidan band qilingan!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val updated = currentUser.copy(username = u, password = p)
                        storage.updateUser(updated)
                        Toast.makeText(context, "Login va parol muvaffaqiyatli saqlandi!", Toast.LENGTH_SHORT).show()
                        showProfileDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
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
fun WorkerTasksView(
    storage: AppStorage,
    currentUser: User,
    mayor: User?
) {
    val context = LocalContext.current
    val app = context.applicationContext as HokimApp
    val voicePlayer = app.voicePlayer
    val voiceRecorder = remember { VoiceRecorder(context) }
    var currentlyPlayingTaskId by remember { mutableStateOf<String?>(null) }
    var acknowledgingTask by remember { mutableStateOf<TaskItem?>(null) }

    val tasks by storage.tasks.collectAsState()
    val now = System.currentTimeMillis()
    val myTasks = tasks.filter { it.assignedWorkerId == currentUser.id }
        .sortedWith(
            compareBy<TaskItem> {
                if (it.status == TaskStatus.COMPLETED_GREEN || it.status == TaskStatus.INSPECTED_BLUE) 1 else 0
            }.thenBy {
                it.endDate
            }
        )
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()) }
    var completingTask by remember { mutableStateOf<TaskItem?>(null) }
    var completionCommentText by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        val myStats = remember(tasks, currentUser) {
            RatingCalculator.calculateWorkerStats(currentUser, tasks)
        }

        val scoreBgColor = when {
            myStats.totalTasks == 0 -> Color(0xFFE2E8F0)
            myStats.score >= 7.5 -> Color(0xFFDCFCE7)
            myStats.score >= 5.0 -> Color(0xFFE0F2FE)
            myStats.score >= 2.5 -> Color(0xFFFEF9C3)
            myStats.score >= 0.5 -> Color(0xFFF1F5F9)
            else -> Color(0xFFFEE2E2)
        }

        val scoreTextColor = when {
            myStats.totalTasks == 0 -> Color(0xFF64748B)
            myStats.score >= 7.5 -> Color(0xFF166534)
            myStats.score >= 5.0 -> Color(0xFF0369A1)
            myStats.score >= 2.5 -> Color(0xFF854D0E)
            myStats.score >= 0.5 -> Color(0xFF475569)
            else -> Color(0xFF991B1B)
        }

        // 1. Worker Rating Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = NavyDark),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("SIZNING REYTINGINGIZ", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (myStats.totalTasks == 0) "0.0 / 10" else "${myStats.score} / 10",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFBBF24), modifier = Modifier.size(20.dp))
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = scoreBgColor
                    ) {
                        Text(
                            myStats.gradeText,
                            color = scoreTextColor,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Divider(color = Color(0xFF334155), thickness = 1.dp)
                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Tekshirildi: ${myStats.inspectedTasks} ta (+${(myStats.inspectedTasks * 0.5)} ball)", fontSize = 11.sp, color = Color(0xFF38BDF8), fontWeight = FontWeight.SemiBold)
                        Text("Erta tugatilgan: ${myStats.earlyCompletedTasks} ta", fontSize = 11.sp, color = Color(0xFF4ADE80), fontWeight = FontWeight.Medium)
                    }
                    Column {
                        Text("Vaqtida boshlangan: ${myStats.earlyStartTasks} ta", fontSize = 11.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                        Text("Kech tugatilgan: ${myStats.lateCompletedTasks} ta", fontSize = 11.sp, color = if (myStats.lateCompletedTasks > 0) Color(0xFFF87171) else Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                    }
                }

                if (myStats.hasLoggedIn) {
                    if (myStats.daysInactive >= 2L) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF450A0A),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                "Ilovaga ${myStats.daysInactive} kundan beri kirmagansiz (-${myStats.inactivityPenalty} ball jarima)",
                                color = Color(0xFFFCA5A5),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                            )
                        }
                    } else if (myStats.daysInactive == 1L) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF713F12),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                "Kecha kirgansiz (Bugungi faollik kutilmoqda)",
                                color = Color(0xFFFEF08A),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                            )
                        }
                    } else {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF14532D),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                "Bugun ilovada faol bo'ldingiz",
                                color = Color(0xFFBBF7D0),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                            )
                        }
                    }
                } else {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFF334155),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "Yangi biriktirilgan (Hali ilovaga kirmagan)",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Eslatma: Ball faqat Hokim topshiriqni tekshirib tasdiqlaganda (+0.5 ball) qo'shiladi! Boshlash yoki tugatishning o'ziga ball berilmaydi.",
                    fontSize = 10.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 2. Task Counts Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                val pending = myTasks.count { it.status == TaskStatus.PENDING_RED }
                val inProgress = myTasks.count { it.status == TaskStatus.IN_PROGRESS_YELLOW }
                val completed = myTasks.count { it.status == TaskStatus.COMPLETED_GREEN || it.status == TaskStatus.INSPECTED_BLUE }

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(pending.toString(), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = StatusRed)
                    Text("Boshlanmagan", fontSize = 11.sp, color = TextSecondary)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(inProgress.toString(), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = StatusYellow)
                    Text("Jarayonda", fontSize = 11.sp, color = TextSecondary)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(completed.toString(), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = StatusGreen)
                    Text("Bajarildi", fontSize = 11.sp, color = TextSecondary)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text("Menga Biriktirilgan Vazifalar", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)

        Spacer(modifier = Modifier.height(10.dp))

        if (myTasks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Hozircha sizga biriktirilgan topshiriqlar yo'q.", color = TextSecondary)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(myTasks) { task ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
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

                            Text(task.title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)

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
                                        val isPlayingThisVoice = currentlyPlayingTaskId == voiceKey
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(PrimaryBlue.copy(alpha = 0.08f))
                                                .clickable {
                                                    if (isPlayingThisVoice) {
                                                        voicePlayer.stop()
                                                        currentlyPlayingTaskId = null
                                                    } else {
                                                        currentlyPlayingTaskId = voiceKey
                                                        if (vData.length < 256 && File(vData).exists()) {
                                                            voicePlayer.play(vData) {
                                                                currentlyPlayingTaskId = null
                                                            }
                                                        } else {
                                                            voicePlayer.playBase64(context, vData, voiceKey) {
                                                                currentlyPlayingTaskId = null
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
                                            val label = if (taskVoices.size > 1) "Rahbar ovozi #${vIdx + 1}" else "Rahbardan ovozli topshiriq"
                                            Text(
                                                if (isPlayingThisVoice) "Topshiriq tinglanmoqda..." else label,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = PrimaryBlue
                                            )
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

                            Text(
                                text = "Rejalashtirilgan boshlanish: " + dateFormat.format(Date(task.startDate)),
                                fontSize = 11.sp,
                                color = TextSecondary
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // 0. TOPSHIRIQNI KO'RDIM DEB TASDIQLASH (Ovozli yoki Matnli)
                            if (task.seenAt == null) {
                                Button(
                                    onClick = { acknowledgingTask = task },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Topshiriqni ko'rdim deb tasdiqlash", color = Color.White, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFFF0FDF4),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(14.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                "Topshiriqni ko'rdingiz: " + dateFormat.format(Date(task.seenAt)),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF15803D)
                                            )
                                        }
                                        if (!task.seenResponseText.isNullOrBlank()) {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text("Javobingiz: \"${task.seenResponseText}\"", fontSize = 12.sp, color = NavyDark)
                                        }
                                        if (!task.seenResponseVoiceBase64.isNullOrBlank() || !task.seenResponseVoicePath.isNullOrBlank()) {
                                            Spacer(modifier = Modifier.height(6.dp))
                                            val isPlayingThis = currentlyPlayingTaskId == task.id
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(PrimaryBlue.copy(alpha = 0.1f))
                                                    .clickable {
                                                        if (isPlayingThis) {
                                                            voicePlayer.stop()
                                                            currentlyPlayingTaskId = null
                                                        } else {
                                                            val p = task.seenResponseVoicePath ?: storage.restoreTaskVoiceBase64(task.id, task.seenResponseVoiceBase64 ?: "")
                                                            if (p != null && File(p).exists()) {
                                                                currentlyPlayingTaskId = task.id
                                                                voicePlayer.play(p) {
                                                                    currentlyPlayingTaskId = null
                                                                }
                                                            } else {
                                                                Toast.makeText(context, "Ovoz yuklanmoqda...", Toast.LENGTH_SHORT).show()
                                                            }
                                                        }
                                                    }
                                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                                            ) {
                                                Icon(
                                                    imageVector = if (isPlayingThis) Icons.Default.Close else Icons.Default.PlayArrow,
                                                    contentDescription = null,
                                                    tint = PrimaryBlue,
                                                    modifier = Modifier.size(20.dp)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    if (isPlayingThis) "Tinglanmoqda..." else "Ovozli javobingiz (${task.seenResponseVoiceDuration}s)",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = PrimaryBlue
                                                )
                                            }
                                        }
                                    }
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            // 1. QIZIL HOLAT: Xodim "Ishni Boshladim" deb bosishi kerak
                            if (task.status == TaskStatus.PENDING_RED) {
                                Button(
                                    onClick = {
                                        if (task.seenAt == null) {
                                            storage.acknowledgeTask(task.id, "Ishni boshladim", null, 0)
                                        }
                                        storage.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS_YELLOW)
                                        Toast.makeText(context, "Ish boshlandi! Holat Sariq rangga o'tdi.", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = StatusYellow),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ishni Boshladim (Sariq holatga o'tish)", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }

                            // 2. SARIQ HOLAT: Xodim "Ishni Tugatdim" deb hisobot berishi kerak
                            if (task.status == TaskStatus.IN_PROGRESS_YELLOW) {
                                Button(
                                    onClick = {
                                        completingTask = task
                                        completionCommentText = ""
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = StatusGreen),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, tint = Color.White)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ishni Tugatdim (Yashil holatga o'tish)", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }

                            // Xodim qoldirgan izoh / hisobot
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
                                        Text("Siz qoldirgan izoh:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = StatusGreen)
                                        Text(task.completionNotes, fontSize = 12.sp, color = NavyDark)
                                    }
                                }
                            }

                            // 3. YASHIL HOLAT: Hokim tekshiruvi kutilmoqda
                            if (task.status == TaskStatus.COMPLETED_GREEN) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(StatusGreenBg)
                                        .padding(10.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        "Ish tugatildi! Hokimning joyiga borib tekshirishi kutilmoqda.",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = StatusGreen
                                    )
                                }
                            }

                            // 4. TEKSHIRILDI: Hokim tasdiqladi
                            if (task.status == TaskStatus.INSPECTED_BLUE) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(StatusBlueBg)
                                        .padding(10.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        "Hokim joyiga borib tekshirdi va muvaffaqiyatli tasdiqladi!",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = StatusBlue
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Topshiriqni ko'rdim deb tasdiqlash modali (Ovozli yoki Matnli)
    if (acknowledgingTask != null) {
        val task = acknowledgingTask!!
        var responseText by remember { mutableStateOf("") }
        var isRecording by remember { mutableStateOf(false) }
        var recordingDuration by remember { mutableIntStateOf(0) }
        var recordedVoicePath by remember { mutableStateOf<String?>(null) }
        var recordedVoiceDuration by remember { mutableIntStateOf(0) }
        var isPlayingPreview by remember { mutableStateOf(false) }

        LaunchedEffect(isRecording) {
            if (isRecording) {
                recordingDuration = 0
                while (isRecording) {
                    delay(1000L)
                    recordingDuration++
                }
            }
        }

        val permissionLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (granted) {
                val path = voiceRecorder.startRecording()
                if (path != null) {
                    isRecording = true
                }
            } else {
                Toast.makeText(context, "Ovoz yozish uchun mikrofon ruxsati kerak", Toast.LENGTH_SHORT).show()
            }
        }

        AlertDialog(
            onDismissRequest = {
                if (isRecording) {
                    voiceRecorder.cancelRecording()
                    isRecording = false
                }
                if (isPlayingPreview) {
                    voicePlayer.stop()
                    isPlayingPreview = false
                }
                acknowledgingTask = null
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Topshiriqni ko'rdim", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = NavyDark)
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = SlateBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(task.title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(12.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(task.address, fontSize = 12.sp, color = TextSecondary)
                            }
                        }
                    }

                    Text("Hokimga javob yoki izoh qoldiring (ovozli yoki matnli):", fontSize = 12.sp, color = TextSecondary)

                    // Tezkor tanlovlar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFEFF6FF),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBFDBFE)),
                            modifier = Modifier.clickable { responseText = "Topshiriqni ko'rdim, qabul qildim!" }
                        ) {
                            Text(
                                "Qabul qildim",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = PrimaryBlue,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFEFF6FF),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBFDBFE)),
                            modifier = Modifier.clickable { responseText = "Yetib bordim, ishni boshladik!" }
                        ) {
                            Text(
                                "Yetib bordim",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = PrimaryBlue,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    // Matn kiritish
                    OutlinedTextField(
                        value = responseText,
                        onValueChange = { responseText = it },
                        placeholder = { Text("Matnli xabar yozing (ixtiyoriy)...", fontSize = 13.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        maxLines = 3
                    )

                    // OVOZLI XABAR YOZISH QISMI
                    Card(
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = if (isRecording) Color(0xFFFEF2F2) else Color(0xFFF8FAFC)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, if (isRecording) StatusRed else Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            if (isRecording) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(12.dp)
                                            .clip(CircleShape)
                                            .background(StatusRed)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        "Ovoz yozilmoqda: ${recordingDuration} sek",
                                        color = StatusRed,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            voiceRecorder.cancelRecording()
                                            isRecording = false
                                            recordedVoicePath = null
                                            recordedVoiceDuration = 0
                                            Toast.makeText(context, "Ovoz o'chirildi", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = Color.White, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("O'chirish", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }

                                    Button(
                                        onClick = {
                                            val res = voiceRecorder.stopRecording()
                                            isRecording = false
                                            if (res != null) {
                                                recordedVoicePath = res.first
                                                recordedVoiceDuration = res.second
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text("To'xtatish", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            }
                                    }
                                }
                            } else if (recordedVoicePath != null) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .clickable {
                                                if (isPlayingPreview) {
                                                    voicePlayer.stop()
                                                    isPlayingPreview = false
                                                } else {
                                                    isPlayingPreview = true
                                                    voicePlayer.play(recordedVoicePath!!) {
                                                        isPlayingPreview = false
                                                    }
                                                }
                                            }
                                            .padding(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (isPlayingPreview) Icons.Default.Close else Icons.Default.PlayArrow,
                                            contentDescription = null,
                                            tint = PrimaryBlue,
                                            modifier = Modifier.size(24.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            if (isPlayingPreview) "Tinglanmoqda..." else "Ovozni eshitish (${recordedVoiceDuration}s)",
                                            color = PrimaryBlue,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }

                                    IconButton(
                                        onClick = {
                                            voicePlayer.stop()
                                            isPlayingPreview = false
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
                                                if (p != null) isRecording = true
                                            } else {
                                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                            }
                                        }
                                        .padding(vertical = 6.dp),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ovozli javob yozish (Mikrofon)", color = PrimaryBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isRecording) {
                            val res = voiceRecorder.stopRecording()
                            isRecording = false
                            if (res != null) {
                                recordedVoicePath = res.first
                                recordedVoiceDuration = res.second
                            }
                        }
                        if (isPlayingPreview) {
                            voicePlayer.stop()
                            isPlayingPreview = false
                        }

                        // Acknowledge task in storage & Firebase
                        storage.acknowledgeTask(
                            taskId = task.id,
                            responseText = responseText.trim().ifBlank { null },
                            voicePath = recordedVoicePath,
                            voiceDurationSec = recordedVoiceDuration
                        )

                        // Also post to Chat between Worker and Mayor
                        if (mayor != null) {
                            val ackText = buildString {
                                append("Topshiriq ko'rildi: \"${task.title}\"")
                                if (responseText.isNotBlank()) {
                                    append("\nJavob: ${responseText.trim()}")
                                }
                            }
                            val chatMsg = ChatMessage(
                                id = UUID.randomUUID().toString(),
                                senderId = currentUser.id,
                                receiverId = mayor.id,
                                senderName = currentUser.fullName,
                                messageType = MessageType.TEXT,
                                textContent = ackText
                            )
                            storage.sendMessage(chatMsg)

                            if (!recordedVoicePath.isNullOrBlank()) {
                                val voiceMsg = ChatMessage(
                                    id = UUID.randomUUID().toString(),
                                    senderId = currentUser.id,
                                    receiverId = mayor.id,
                                    senderName = currentUser.fullName,
                                    messageType = MessageType.VOICE,
                                    textContent = "Topshiriq bo'yicha ovozli javob: \"${task.title}\"",
                                    mediaPath = recordedVoicePath,
                                    audioDurationSec = recordedVoiceDuration
                                )
                                storage.sendMessage(voiceMsg)
                            }
                        }

                        Toast.makeText(context, "Topshiriq ko'rildi deb tasdiqlandi va Hokimga yetkazildi!", Toast.LENGTH_SHORT).show()
                        acknowledgingTask = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Tasdiqlash va Yuborish", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        if (isRecording) {
                            voiceRecorder.cancelRecording()
                            isRecording = false
                        }
                        if (isPlayingPreview) {
                            voicePlayer.stop()
                            isPlayingPreview = false
                        }
                        acknowledgingTask = null
                    }
                ) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    // Topshiriqni yakunlashda hisobot / izoh yozish modali
    val currentCompletingTask = completingTask
    if (currentCompletingTask != null) {
        val targetTask = currentCompletingTask
        AlertDialog(
            onDismissRequest = { completingTask = null },
            title = {
                Text("Topshiriqni yakunlash", fontWeight = FontWeight.Bold, color = NavyDark)
            },
            text = {
                Column {
                    Text(
                        text = targetTask.title,
                        fontWeight = FontWeight.SemiBold,
                        color = PrimaryBlue,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Manzil: ${targetTask.address}",
                        fontSize = 12.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )
                    Text(
                        text = "Bajarilgan ish bo'yicha izoh yoki hisobot yozing:",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = NavyDark,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    OutlinedTextField(
                        value = completionCommentText,
                        onValueChange = { completionCommentText = it },
                        placeholder = { Text("Masalan: Asfalt qoplamasi to'liq yotqizildi, kamchiliklar bartaraf etildi...", fontSize = 13.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 5,
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val notes = completionCommentText.trim()
                        storage.updateTaskStatus(targetTask.id, TaskStatus.COMPLETED_GREEN, notes.ifEmpty { null })

                        if (mayor != null) {
                            val reportText = if (notes.isNotEmpty()) {
                                "Hurmatli Hokim! '${targetTask.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi.\n\nXodim izohi: $notes\nManzil: ${targetTask.address}"
                            } else {
                                "Hurmatli Hokim! '${targetTask.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi va topshirishga tayyor. (Manzil: ${targetTask.address})"
                            }
                            storage.sendMessage(
                                ChatMessage(
                                    id = UUID.randomUUID().toString(),
                                    senderId = currentUser.id,
                                    receiverId = mayor.id,
                                    senderName = currentUser.fullName,
                                    messageType = MessageType.TEXT,
                                    textContent = reportText
                                )
                            )
                        }

                        Toast.makeText(context, "Topshiriq tugatildi! Izoh va xabarnoma Hokimga yuborildi.", Toast.LENGTH_SHORT).show()
                        completingTask = null
                        completionCommentText = ""
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = StatusGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Tugatdim va Yuborish", fontWeight = FontWeight.Bold, color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { completingTask = null }) {
                    Text("Bekor qilish", color = TextSecondary)
                }
            }
        )
    }
}
