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
    val context = LocalContext.current
    var lastBackPressTime by remember { mutableStateOf(0L) }

    // 1 ta orqaga bossa Asosiy (Home) sahifaga qaytadi, home page da turganda 2 marta tez bossa ilovadan chiqadi
    androidx.activity.compose.BackHandler(enabled = true) {
        if (selectedTab != 0) {
            selectedTab = 0
        } else {
            val now = System.currentTimeMillis()
            if (now - lastBackPressTime < 2000L) {
                (context as? android.app.Activity)?.finish()
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
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

                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Chiqish", tint = Color.White)
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
}

@Composable
fun WorkerTasksView(
    storage: AppStorage,
    currentUser: User,
    mayor: User?
) {
    val context = LocalContext.current
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
            myStats.score >= 8.5 -> Color(0xFFDCFCE7)
            myStats.score >= 6.5 -> Color(0xFFE0F2FE)
            myStats.score >= 5.0 -> Color(0xFFFEF9C3)
            else -> Color(0xFFFEE2E2)
        }

        val scoreTextColor = when {
            myStats.totalTasks == 0 -> Color(0xFF64748B)
            myStats.score >= 8.5 -> Color(0xFF166534)
            myStats.score >= 6.5 -> Color(0xFF0369A1)
            myStats.score >= 5.0 -> Color(0xFF854D0E)
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
                            Text("⭐", fontSize = 20.sp)
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
                        Text("🚀 Erta tugatilgan: ${myStats.earlyCompletedTasks} ta", fontSize = 11.sp, color = Color(0xFF4ADE80), fontWeight = FontWeight.Medium)
                        Text("⚡ Vaqtida boshlangan: ${myStats.earlyStartTasks} ta", fontSize = 11.sp, color = Color(0xFF60A5FA), fontWeight = FontWeight.Medium)
                    }
                    Column {
                        Text("⏰ Kech tugatilgan: ${myStats.lateCompletedTasks} ta", fontSize = 11.sp, color = if (myStats.lateCompletedTasks > 0) Color(0xFFF87171) else Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                        Text("❌ Muddati o'tgan: ${myStats.overduePendingTasks} ta", fontSize = 11.sp, color = if (myStats.overduePendingTasks > 0) Color(0xFFF87171) else Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                    }
                }

                if (myStats.daysInactive >= 1) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFF450A0A),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "⚠️ Ilovaga ${myStats.daysInactive} kundan beri kirmagansiz (-${myStats.inactivityPenalty} ball jarima)",
                            color = Color(0xFFFCA5A5),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "💡 Eslatma: Ball faqat topshiriqni erta boshlab erta topshirganingizda oshadi! Ilovaga kirmay qo'yish ballni tushiradi.",
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

                            Text(task.title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)

                            Spacer(modifier = Modifier.height(4.dp))

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = StatusRed, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(task.address, fontSize = 13.sp, color = NavyDark, fontWeight = FontWeight.SemiBold)
                            }

                            Text(
                                text = task.description,
                                fontSize = 13.sp,
                                color = TextSecondary,
                                modifier = Modifier.padding(vertical = 6.dp)
                            )

                            Text(
                                text = "Rejalashtirilgan boshlanish: " + dateFormat.format(Date(task.startDate)),
                                fontSize = 11.sp,
                                color = TextSecondary
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // 1. QIZIL HOLAT: Xodim "Ishni Boshladim" deb bosishi kerak
                            if (task.status == TaskStatus.PENDING_RED) {
                                Button(
                                    onClick = {
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
                                        "🟢 Ish tugatildi! Hokimning joyiga borib tekshirishi kutilmoqda.",
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
                                        "🔵 Hokim joyiga borib tekshirdi va muvaffaqiyatli tasdiqladi!",
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
                                "Hurmatli Hokim! '${targetTask.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi.\n\n📝 Xodim izohi: $notes\n📍 Manzil: ${targetTask.address}"
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
