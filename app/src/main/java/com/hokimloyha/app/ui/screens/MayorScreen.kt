package com.hokimloyha.app.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
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

                    Row {
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
}

@Composable
fun MayorScheduleTab(storage: AppStorage, currentUser: User) {
    val context = LocalContext.current
    val schedules by storage.schedules.collectAsState()
    val mayorSchedules = schedules.filter { it.mayorId == currentUser.id }
        .sortedBy { it.scheduledTime }
    var showAddDialog by remember { mutableStateOf(false) }
    val timeFormat = remember { SimpleDateFormat("HH:mm, dd-MMMM", Locale("uz")) }

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
                        Text("Uchrashuv va boradigan joydan 30 daqiqa oldin ovozli eslatma bildirishnomasi yangraydi.", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
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

            if (mayorSchedules.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Hozircha rejalar kiritilmagan.", color = TextSecondary)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(mayorSchedules) { schedule ->
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

                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(Color(0xFFFEF3C7))
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text("-30 min signal", fontSize = 11.sp, color = Color(0xFFB45309), fontWeight = FontWeight.SemiBold)
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))
                                Text(schedule.title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NavyDark)

                                Row(modifier = Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(schedule.location, fontSize = 13.sp, color = TextSecondary)
                                }

                                if (!schedule.notes.isNullOrBlank()) {
                                    Text(
                                        text = schedule.notes,
                                        fontSize = 12.sp,
                                        color = TextSecondary,
                                        modifier = Modifier.padding(top = 6.dp)
                                    )
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
        var location by remember { mutableStateOf("") }
        var notes by remember { mutableStateOf("") }
        val calendar = remember { Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, 1) } }
        var selectedCalendarTime by remember { mutableStateOf(calendar.timeInMillis) }
        val format = remember { SimpleDateFormat("HH:mm, dd-MM-yyyy", Locale.getDefault()) }

        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = { Text("Yangi Kunlik Reja Qo'shish", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it },
                        label = { Text("Reja nomi / Maqsad") },
                        placeholder = { Text("Masalan: 24-maktabga borish") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = location,
                        onValueChange = { location = it },
                        label = { Text("Manzil / Joylashuv") },
                        placeholder = { Text("Masalan: 24-sonli umumta'lim maktabi") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Izoh (Ixtiyoriy)") },
                        modifier = Modifier.fillMaxWidth()
                    )

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
                        if (title.isBlank() || location.isBlank()) {
                            Toast.makeText(context, "Sarlavha va manzilni kiriting!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val newSchedule = ScheduleItem(
                            id = UUID.randomUUID().toString(),
                            mayorId = currentUser.id,
                            title = title.trim(),
                            location = location.trim(),
                            notes = notes.trim().ifBlank { null },
                            scheduledTime = selectedCalendarTime
                        )
                        storage.addSchedule(newSchedule)
                        ScheduleScheduler.scheduleReminder(
                            context,
                            newSchedule.id,
                            newSchedule.title,
                            newSchedule.location,
                            newSchedule.notificationTime
                        )
                        Toast.makeText(context, "Reja qo'shildi va 30 daqiqa oldingi signal o'rnatildi!", Toast.LENGTH_SHORT).show()
                        showAddDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Saqlash", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDialog = false }) {
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
    val filterTabs = listOf("Barchasi", "Boshlanmagan (🔴)", "Jarayonda (🟡)", "Bajarildi (🟢)", "Tekshirildi (🔵)")

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
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()) }

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

            if (filteredTasks.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Topshiriqlar mavjud emas.", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredTasks) { task ->
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
                                                "⚠️ Muddat o'tgan!"
                                            } else {
                                                val totalHours = diff / (1000 * 60 * 60)
                                                val totalMinutes = (diff / (1000 * 60)) % 60
                                                val days = totalHours / 24
                                                val remHours = totalHours % 24
                                                if (days > 0) {
                                                    "⏳ ${days} kun ${remHours} soat qoldi"
                                                } else if (remHours > 0) {
                                                    "⏳ ${remHours} soat ${totalMinutes} daq qoldi"
                                                } else {
                                                    "⏳ ${totalMinutes} daqiqa qoldi"
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

                                    // Zvuk / Ovozli topshiriq yuborish tugmasi
                                    if (!isThisTaskRecording) {
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
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("🎤", fontSize = 14.sp)
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text("Zvuk", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                                                                textContent = "🎤 Topshiriq: \"${task.title}\"",
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

                                if (!task.voiceBase64.isNullOrBlank() || !task.voicePath.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    val isPlayingOrderVoice = currentlyPlayingVoiceTaskId == "order_${task.id}"
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(PrimaryBlue.copy(alpha = 0.1f))
                                            .clickable {
                                                if (isPlayingOrderVoice) {
                                                    voicePlayer.stop()
                                                    currentlyPlayingVoiceTaskId = null
                                                } else {
                                                    val p = task.voicePath ?: storage.restoreVoiceAudioBase64("voice_order_${task.id}.m4a", task.voiceBase64 ?: "")
                                                    if (p != null && File(p).exists()) {
                                                        currentlyPlayingVoiceTaskId = "order_${task.id}"
                                                        voicePlayer.play(p) {
                                                            currentlyPlayingVoiceTaskId = null
                                                        }
                                                    } else {
                                                        Toast.makeText(context, "Ovoz yuklanmoqda...", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            }
                                            .padding(horizontal = 10.dp, vertical = 6.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (isPlayingOrderVoice) Icons.Default.Close else Icons.Default.PlayArrow,
                                            contentDescription = null,
                                            tint = PrimaryBlue,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            if (isPlayingOrderVoice) "Topshiriq tinglanmoqda..." else "🎤 Ovozli topshiriq (${task.voiceDurationSec}s)",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = PrimaryBlue
                                        )
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

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(SlateBg)
                                        .padding(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Column {
                                        Text("Mas'ul: " + task.assignedWorkerName, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = NavyDark)
                                        Text("Boshlanish: " + dateFormat.format(Date(task.startDate)), fontSize = 11.sp, color = TextSecondary)
                                    }
                                }

                                // Xodim topshiriqni ko'rganligi / ko'rmaganligi haqida
                                if (task.seenAt != null) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDF4),
                                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(modifier = Modifier.padding(10.dp)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text("👁️", fontSize = 14.sp)
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    "Xodim ko'rdi: " + dateFormat.format(Date(task.seenAt)),
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF15803D)
                                                )
                                            }
                                            if (!task.seenResponseText.isNullOrBlank()) {
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Text("💬 Xodim javobi: \"${task.seenResponseText}\"", fontSize = 12.sp, color = NavyDark)
                                            }
                                            if (!task.seenResponseVoiceBase64.isNullOrBlank() || !task.seenResponseVoicePath.isNullOrBlank()) {
                                                Spacer(modifier = Modifier.height(6.dp))
                                                val isPlayingThis = currentlyPlayingVoiceTaskId == task.id
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(8.dp))
                                                        .background(PrimaryBlue.copy(alpha = 0.1f))
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
                                                        if (isPlayingThis) "Tinglanmoqda..." else "🎤 Ovozli javob (${task.seenResponseVoiceDuration}s)",
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = PrimaryBlue
                                                    )
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFFFFBEB),
                                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDE68A)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(8.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("⚠️", fontSize = 14.sp)
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                "Xodim hali ko'rmagan (Tasdiqlanmagan)",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFFB45309)
                                            )
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
    var selectedWorker by remember { mutableStateOf(workers.first()) }
    var expanded by remember { mutableStateOf(false) }

    val startCal = remember { Calendar.getInstance() }
    val endCal = remember { Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 2) } }
    var startDateMillis by remember { mutableStateOf(startCal.timeInMillis) }
    var endDateMillis by remember { mutableStateOf(endCal.timeInMillis) }
    val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()) }

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
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Topshiriq") },
                    placeholder = { Text("Topshiriqni yozing...") },
                    modifier = Modifier.fillMaxWidth()
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
                                    // Xato gapirib qo'ysa o'chirish / bekor qilish
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

                                    // To'xtatish
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
                                        if (isPlayingVoicePreview) "Tinglanmoqda..." else "🎤 Ovozni eshitish (${recordedVoiceDuration}s)",
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
                                Text("🎤", fontSize = 16.sp)
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
                        label = { Text("Biriktiriladigan Mas'ul Xodim") },
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
                            val c = Calendar.getInstance()
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d)
                                TimePickerDialog(context, { _, h, min ->
                                    c.set(Calendar.HOUR_OF_DAY, h)
                                    c.set(Calendar.MINUTE, min)
                                    startDateMillis = c.timeInMillis
                                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Boshlanish:", fontSize = 10.sp, color = TextSecondary)
                            Text(dateFormat.format(Date(startDateMillis)), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    OutlinedButton(
                        onClick = {
                            val c = Calendar.getInstance()
                            DatePickerDialog(context, { _, y, m, d ->
                                c.set(y, m, d)
                                TimePickerDialog(context, { _, h, min ->
                                    c.set(Calendar.HOUR_OF_DAY, h)
                                    c.set(Calendar.MINUTE, min)
                                    endDateMillis = c.timeInMillis
                                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
                            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Column {
                            Text("Tugash:", fontSize = 10.sp, color = TextSecondary)
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
                        recordedVoicePath != null -> "🎤 Ovozli topshiriq (${recordedVoiceDuration}s)"
                        else -> {
                            Toast.makeText(context, "Topshiriq matnini kiriting yoki ovoz yozing!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                    }
                    onTaskCreated(finalTitle, "", "", selectedWorker, startDateMillis, endDateMillis, recordedVoicePath, recordedVoiceDuration)
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
    var sortByRating by remember { mutableStateOf(true) }

    val rankedWorkers = remember(workers, tasks) {
        RatingCalculator.calculateAllWorkerStats(workers, tasks)
    }

    val displayedWorkers = remember(rankedWorkers, sortByRating) {
        if (sortByRating) rankedWorkers else rankedWorkers.sortedBy { it.first.fullName }
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
                            Text("🏆 XODIMLAR REYTINGI", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
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
                                        "Ball ⭐",
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
                                    Text("🥈", fontSize = 20.sp)
                                    Text(second.first.firstName, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text("${second.second.score} ⭐", color = Color(0xFFCBD5E1), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            // 1st Place (Winner)
                            val first = rankedWorkers[0]
                            if (first.second.score > 0) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("🥇", fontSize = 28.sp)
                                    Text(first.first.firstName, color = Color(0xFFFBBF24), fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                    Text("${first.second.score} / 10 ⭐", color = Color(0xFFFBBF24), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            // 3rd Place
                            if (rankedWorkers.size >= 3 && rankedWorkers[2].second.score > 0) {
                                val third = rankedWorkers[2]
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("🥉", fontSize = 18.sp)
                                    Text(third.first.firstName, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text("${third.second.score} ⭐", color = Color(0xFFCD7F32), fontSize = 11.sp, fontWeight = FontWeight.Bold)
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

            if (workers.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Xodimlar mavjud emas. '+' orqali ishchi qo'shing.", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(displayedWorkers) { (worker, stats) ->
                        val rankIcon = when (stats.rank) {
                            1 -> "🥇"
                            2 -> "🥈"
                            3 -> "🥉"
                            else -> "#${stats.rank}"
                        }

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
                                                    if (stats.totalTasks == 0) "0.0 / 10 ⚪" else "${stats.score} / 10 ⭐",
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
                                        Text("🔍 Tekshirildi: ${stats.inspectedTasks} ta (+${stats.inspectedTasks * 0.5}⭐)", fontSize = 11.sp, color = PrimaryBlue, fontWeight = FontWeight.SemiBold)
                                        Text("🚀 Erta topshirilgan: ${stats.earlyCompletedTasks}", fontSize = 11.sp, color = Color(0xFF15803D), fontWeight = FontWeight.Medium)
                                    }
                                    Column {
                                        Text("⚡ Vaqtida boshlangan: ${stats.earlyStartTasks}", fontSize = 11.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                                        Text("⏰ Kechikkan: ${stats.lateCompletedTasks}", fontSize = 11.sp, color = if (stats.lateCompletedTasks > 0) StatusRed else TextSecondary, fontWeight = FontWeight.Medium)
                                    }
                                }

                                // Inactivity penalty alert
                                if (stats.daysInactive >= 1) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = Color(0xFFFEF2F2),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(
                                            "⚠️ Ilovaga ${stats.daysInactive} kundan beri kirmagan (-${stats.inactivityPenalty} ball jarima)",
                                            fontSize = 11.sp,
                                            color = StatusRed,
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
                                            Text("Tel: ${worker.phone}", fontSize = 11.sp, color = TextSecondary)
                                        }
                                        Text("Login: ${worker.username} | Parol: ${worker.password}", fontSize = 11.sp, color = Color(0xFF0284C7))
                                    }

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
                                                Text(
                                                    text = if (isRead) "✓✓" else "✓",
                                                    color = if (isRead) Color(0xFF0284C7) else Color(0xFF94A3B8),
                                                    fontSize = 12.sp,
                                                    fontWeight = if (isRead) FontWeight.Black else FontWeight.Bold
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
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.VOICE -> "🎤 Ovozli xabar (" + lastMessage.audioDurationSec + " sek)"
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.IMAGE -> "🖼️ Rasm"
                                    lastMessage.messageType == com.hokimloyha.app.model.MessageType.VIDEO -> "🎥 Video"
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
