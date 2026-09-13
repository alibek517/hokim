package com.hokimloyha.app.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.Toast
import android.widget.MediaController
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.hokimloyha.app.HokimApp
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.model.ChatMessage
import com.hokimloyha.app.model.MessageType
import com.hokimloyha.app.model.User
import com.hokimloyha.app.service.VoiceRecorder
import com.hokimloyha.app.ui.theme.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.delay
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChatConversationScreen(
    storage: AppStorage,
    currentUser: User,
    peerUser: User,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as HokimApp
    val voicePlayer = app.voicePlayer
    val voiceRecorder = remember { VoiceRecorder(context) }

    val messages by storage.messages.collectAsState()
    val isSocketConnected by storage.isConnected.collectAsState()

    val chatMessages = messages.filter {
        (it.senderId == currentUser.id && it.receiverId == peerUser.id) ||
        (it.senderId == peerUser.id && it.receiverId == currentUser.id)
    }.sortedBy { it.timestamp }

    var inputText by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableIntStateOf(0) }
    var currentlyPlayingMessageId by remember { mutableStateOf<String?>(null) }
    var showAttachDialog by remember { mutableStateOf(false) }
    var playingVideoPath by remember { mutableStateOf<String?>(null) }
    var selectedMessageForAction by remember { mutableStateOf<ChatMessage?>(null) }
    var editingMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var showDeleteConfirmDialog by remember { mutableStateOf<ChatMessage?>(null) }

    val listState = rememberLazyListState()
    val timeFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    // Ushbu suhbat sahifasida turganlik holatini kuzatish
    DisposableEffect(peerUser.id) {
        com.hokimloyha.app.service.AppStateTracker.activeChatPeerUserId = peerUser.id
        onDispose {
            if (com.hokimloyha.app.service.AppStateTracker.activeChatPeerUserId == peerUser.id) {
                com.hokimloyha.app.service.AppStateTracker.activeChatPeerUserId = null
            }
        }
    }

    // Orqaga (Back) bosilganda: video ochiq bo'lsa videoni yopish, dialog ochiq bo'lsa dialogni, aks holda chatdan chiqish
    androidx.activity.compose.BackHandler(enabled = true) {
        when {
            playingVideoPath != null -> playingVideoPath = null
            showAttachDialog -> showAttachDialog = false
            selectedMessageForAction != null -> selectedMessageForAction = null
            showDeleteConfirmDialog != null -> showDeleteConfirmDialog = null
            editingMessage != null -> {
                editingMessage = null
                inputText = ""
            }
            else -> onBack()
        }
    }

    // 1. Galereyadan Rasm tanlash launcher
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val originalBitmap = BitmapFactory.decodeStream(inputStream)
                inputStream?.close()

                if (originalBitmap != null) {
                    // Rasmni optimal o'lchamda siqish
                    val maxDim = 1000
                    val scale = if (originalBitmap.width > maxDim || originalBitmap.height > maxDim) {
                        val maxOriginal = maxOf(originalBitmap.width, originalBitmap.height)
                        maxDim.toFloat() / maxOriginal
                    } else 1.0f

                    val scaledBitmap = if (scale < 1.0f) {
                        Bitmap.createScaledBitmap(
                            originalBitmap,
                            (originalBitmap.width * scale).toInt(),
                            (originalBitmap.height * scale).toInt(),
                            true
                        )
                    } else originalBitmap

                    val imagesDir = File(context.filesDir, "chat_images")
                    if (!imagesDir.exists()) imagesDir.mkdirs()
                    val imgFile = File(imagesDir, "img_" + System.currentTimeMillis() + ".jpg")
                    val fos = FileOutputStream(imgFile)
                    scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 75, fos)
                    fos.close()

                    val msg = ChatMessage(
                        id = UUID.randomUUID().toString(),
                        senderId = currentUser.id,
                        receiverId = peerUser.id,
                        senderName = currentUser.fullName,
                        messageType = MessageType.IMAGE,
                        mediaPath = imgFile.absolutePath,
                        isRead = false
                    )
                    storage.sendMessage(msg)
                    Toast.makeText(context, "Rasm yuborildi!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(context, "Rasmni yuklashda xatolik: " + e.message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    // 2. Galereyadan Video tanlash launcher
    val videoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val videosDir = File(context.filesDir, "chat_videos")
                if (!videosDir.exists()) videosDir.mkdirs()
                val vidFile = File(videosDir, "vid_" + System.currentTimeMillis() + ".mp4")
                val fos = FileOutputStream(vidFile)
                inputStream?.copyTo(fos)
                inputStream?.close()
                fos.close()

                val msg = ChatMessage(
                    id = UUID.randomUUID().toString(),
                    senderId = currentUser.id,
                    receiverId = peerUser.id,
                    senderName = currentUser.fullName,
                    messageType = MessageType.VIDEO,
                    mediaPath = vidFile.absolutePath,
                    textContent = "Video fayl",
                    isRead = false
                )
                storage.sendMessage(msg)
                Toast.makeText(context, "Video yuborildi!", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(context, "Videoni yuklashda xatolik", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Mikrofon ruxsati tekshiruvi
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            val path = voiceRecorder.startRecording()
            if (path != null) {
                isRecording = true
                recordingDuration = 0
            }
        } else {
            Toast.makeText(context, "Ovozli xabar uchun mikrofon ruxsati kerak!", Toast.LENGTH_SHORT).show()
        }
    }

    // Yozib olish taymeri
    LaunchedEffect(isRecording) {
        if (isRecording) {
            recordingDuration = 0
            while (isRecording) {
                delay(1000L)
                recordingDuration++
            }
        }
    }

    // O'qildi deb belgilash
    LaunchedEffect(chatMessages.size, chatMessages.lastOrNull()?.id, chatMessages.count { !it.isDeliveredAndRead && it.receiverId == currentUser.id }) {
        storage.markMessagesAsRead(currentUser.id, peerUser.id)
        if (chatMessages.isNotEmpty()) {
            listState.animateScrollToItem(chatMessages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(NavyDark)
                    .padding(horizontal = 8.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Orqaga", tint = Color.White)
                    }

                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(PrimaryBlue),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = peerUser.firstName.take(1).uppercase() + peerUser.lastName.take(1).uppercase(),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(peerUser.fullName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(if (isSocketConnected) Color(0xFF22C55E) else Color(0xFFF59E0B))
                            )
                            Spacer(modifier = Modifier.width(5.dp))
                            Text(
                                text = if (isSocketConnected) (peerUser.position ?: "Online") else "Ulanmoqda...",
                                color = if (isSocketConnected) Color(0xFF38BDF8) else Color(0xFFFBBF24),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        },
        bottomBar = {
            Surface(
                color = Color.White,
                tonalElevation = 8.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    // Xabarni tahrirlash (Edit) paneli
                    if (editingMessage != null) {
                        Surface(
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = "Tahrirlash",
                                    tint = PrimaryBlue,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Xabarni tahrirlash",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = PrimaryBlue
                                    )
                                    Text(
                                        text = editingMessage!!.textContent ?: "",
                                        fontSize = 11.sp,
                                        color = TextSecondary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        editingMessage = null
                                        inputText = ""
                                    },
                                    modifier = Modifier.size(26.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Bekor qilish",
                                        tint = TextSecondary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                        HorizontalDivider(color = Color(0xFFCBD5E1), thickness = 0.5.dp)
                    }

                    if (isRecording) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFFFEF2F2))
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(12.dp)
                                        .clip(CircleShape)
                                        .background(StatusRed)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Yozilmoqda: ${recordingDuration}s",
                                    color = StatusRed,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedButton(
                                    onClick = {
                                        voiceRecorder.cancelRecording()
                                        isRecording = false
                                        Toast.makeText(context, "Ovoz o'chirildi", Toast.LENGTH_SHORT).show()
                                    },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusRed),
                                    modifier = Modifier.padding(end = 8.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Delete, contentDescription = null, tint = StatusRed, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("O'chirish", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = StatusRed) }
                                }
                                Button(
                                    onClick = {
                                        val result = voiceRecorder.stopRecording()
                                        isRecording = false
                                        if (result != null) {
                                            val (path, durationSec) = result
                                            val voiceMsg = ChatMessage(
                                                id = UUID.randomUUID().toString(),
                                                senderId = currentUser.id,
                                                receiverId = peerUser.id,
                                                senderName = currentUser.fullName,
                                                messageType = MessageType.VOICE,
                                                mediaPath = path,
                                                audioDurationSec = durationSec,
                                                isRead = false
                                            )
                                            storage.sendMessage(voiceMsg)
                                            Toast.makeText(context, "Ovozli xabar yuborildi!", Toast.LENGTH_SHORT).show()
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Yuborish", fontSize = 12.sp, color = Color.White, fontWeight = FontWeight.Bold) }
                                }
                            }
                        }
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // GALEREYA (Qisqich) TUGMASI: Rasm yoki Video tanlash
                            IconButton(onClick = { showAttachDialog = true }) {
                                Icon(Icons.Default.Add, contentDescription = "Galereya", tint = PrimaryBlue, modifier = Modifier.size(28.dp))
                            }

                            // Matn kiritish
                            OutlinedTextField(
                                value = inputText,
                                onValueChange = { inputText = it },
                                placeholder = { Text(if (editingMessage != null) "Tahrirni kiriting..." else "Xabar yozing...", fontSize = 14.sp) },
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(horizontal = 4.dp),
                                shape = RoundedCornerShape(24.dp),
                                maxLines = 4
                            )

                            // Mikrofon yoki Yuborish tugmasi
                            if (inputText.isBlank() && editingMessage == null) {
                                IconButton(
                                    onClick = {
                                        val hasPermission = ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.RECORD_AUDIO
                                        ) == PackageManager.PERMISSION_GRANTED

                                        if (hasPermission) {
                                            val path = voiceRecorder.startRecording()
                                            if (path != null) {
                                                isRecording = true
                                            } else {
                                                Toast.makeText(context, "Ovoz yozishni boshlab bo'lmadi", Toast.LENGTH_SHORT).show()
                                            }
                                        } else {
                                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                        }
                                    }
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
                                            .background(PrimaryBlue),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                                    }
                                }
                            } else {
                                IconButton(
                                    onClick = {
                                        val text = inputText.trim()
                                        if (text.isNotEmpty()) {
                                            if (editingMessage != null) {
                                                storage.editMessage(editingMessage!!.id, text)
                                                editingMessage = null
                                                inputText = ""
                                                Toast.makeText(context, "Xabar tahrirlandi", Toast.LENGTH_SHORT).show()
                                            } else {
                                                val newMsg = ChatMessage(
                                                    id = UUID.randomUUID().toString(),
                                                    senderId = currentUser.id,
                                                    receiverId = peerUser.id,
                                                    senderName = currentUser.fullName,
                                                    messageType = MessageType.TEXT,
                                                    textContent = text,
                                                    isRead = false
                                                )
                                                storage.sendMessage(newMsg)
                                                inputText = ""
                                            }
                                        }
                                    }
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(CircleShape)
                                            .background(if (editingMessage != null) StatusGreen else PrimaryBlue),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = if (editingMessage != null) Icons.Default.Check else Icons.Default.Send,
                                            contentDescription = if (editingMessage != null) "Tahrirni saqlash" else "Yuborish",
                                            tint = Color.White
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        containerColor = Color(0xFFECEFF1)
    ) { padding ->
        if (chatMessages.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "Muloqot boshlanmagan. Rasm, video yoki xabar yuboring!",
                    color = TextSecondary,
                    fontSize = 13.sp
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(chatMessages) { message ->
                    val isMe = message.senderId == currentUser.id

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (isMe) Arrangement.End else Arrangement.Start
                    ) {
                        Card(
                            shape = RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = if (isMe) 16.dp else 2.dp,
                                bottomEnd = if (isMe) 2.dp else 16.dp
                            ),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isMe) Color(0xFFDCF8C6) else Color.White
                            ),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier
                                .widthIn(max = 290.dp)
                                .combinedClickable(
                                    onClick = {
                                        if (message.messageType == MessageType.TEXT) {
                                            selectedMessageForAction = message
                                        }
                                    },
                                    onLongClick = {
                                        selectedMessageForAction = message
                                    }
                                )
                        ) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                when (message.messageType) {
                                    // 1. MATNLI XABAR
                                    MessageType.TEXT -> {
                                        Text(
                                            text = message.textContent ?: "",
                                            fontSize = 14.sp,
                                            color = NavyDark,
                                            modifier = Modifier.padding(2.dp)
                                        )
                                    }

                                    // 2. GALEREYADAN YUBORILGAN RASM
                                    MessageType.IMAGE -> {
                                        val imgPath = message.mediaPath
                                        val bitmap = remember(imgPath) {
                                            if (imgPath != null && File(imgPath).exists()) {
                                                BitmapFactory.decodeFile(imgPath)
                                            } else null
                                        }

                                        if (bitmap != null) {
                                            Image(
                                                bitmap = bitmap.asImageBitmap(),
                                                contentDescription = "Rasm",
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .heightIn(min = 150.dp, max = 260.dp)
                                                    .clip(RoundedCornerShape(10.dp))
                                            )
                                        } else {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(120.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(Color(0xFFE2E8F0)),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text("Rasm yuklanmoqda...", color = TextSecondary, fontSize = 12.sp)
                                            }
                                        }
                                    }

                                    // 3. GALEREYADAN YUBORILGAN VIDEO
                                    MessageType.VIDEO -> {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(PrimaryBlue.copy(alpha = 0.1f))
                                                .clickable {
                                                    val path = message.mediaPath
                                                    if (path != null && File(path).exists()) {
                                                        playingVideoPath = path
                                                    } else {
                                                        Toast.makeText(context, "Video fayl topilmadi yoki yuklanmoqda...", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                                .padding(10.dp)
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(42.dp)
                                                    .clip(CircleShape)
                                                    .background(PrimaryBlue),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White)
                                            }
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Column {
                                                Text("Video fayl", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = NavyDark)
                                                Text("Ko'rish uchun bosing", fontSize = 11.sp, color = PrimaryBlue)
                                            }
                                        }
                                    }

                                    // 4. OVOZLI XABAR
                                    MessageType.VOICE -> {
                                        val isPlaying = currentlyPlayingMessageId == message.id

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.clickable {
                                                if (isPlaying) {
                                                    voicePlayer.stop()
                                                    currentlyPlayingMessageId = null
                                                } else {
                                                    message.mediaPath?.let { path ->
                                                        currentlyPlayingMessageId = message.id
                                                        voicePlayer.play(path) {
                                                            currentlyPlayingMessageId = null
                                                        }
                                                    } ?: run {
                                                        Toast.makeText(context, "Ovoz yuklanmoqda...", Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            }
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(38.dp)
                                                    .clip(CircleShape)
                                                    .background(PrimaryBlue),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(
                                                    imageVector = if (isPlaying) Icons.Default.Close else Icons.Default.PlayArrow,
                                                    contentDescription = null,
                                                    tint = Color.White
                                                )
                                            }

                                            Spacer(modifier = Modifier.width(10.dp))

                                            Column {
                                                Text(
                                                    text = "Ovozli xabar",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    color = NavyDark
                                                )
                                                Text(
                                                    text = "" + message.audioDurationSec + " sek " + if (isPlaying) "• Tinglanmoqda..." else "",
                                                    fontSize = 11.sp,
                                                    color = PrimaryBlue
                                                )
                                            }
                                        }
                                    }
                                }

                                Row(
                                    modifier = Modifier
                                        .align(Alignment.End)
                                        .padding(top = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    if (message.isEdited || message.edited) {
                                        Text(
                                            text = "tahrirlandi  ",
                                            fontSize = 9.sp,
                                            fontStyle = FontStyle.Italic,
                                            color = TextSecondary
                                        )
                                    }
                                    Text(
                                        text = timeFormat.format(Date(message.timestamp)),
                                        fontSize = 10.sp,
                                        color = TextSecondary
                                    )
                                    if (isMe) {
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Icon(
                                            imageVector = if (message.isDeliveredAndRead) Icons.Default.Done else Icons.Default.Done,
                                            contentDescription = null,
                                            tint = if (message.isDeliveredAndRead) Color(0xFF0284C7) else Color(0xFF94A3B8),
                                            modifier = Modifier.size(14.dp)
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

    // Galereyadan Rasm yoki Video tanlash modali
    if (showAttachDialog) {
        AlertDialog(
            onDismissRequest = { showAttachDialog = false },
            title = { Text("Galereyadan yuborish", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Rasm tanlash tugmasi
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showAttachDialog = false
                                imagePickerLauncher.launch("image/*")
                            },
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = SlateBg)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Place, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Rasm yuborish", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                Text("Galereyadan fotosurat tanlash", fontSize = 12.sp, color = TextSecondary)
                            }
                        }
                    }

                    // Video tanlash tugmasi
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showAttachDialog = false
                                videoPickerLauncher.launch("video/*")
                            },
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = SlateBg)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color(0xFFE11D48), modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Video yuborish", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                Text("Galereyadan video fayl tanlash", fontSize = 12.sp, color = TextSecondary)
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showAttachDialog = false }) {
                    Text("Bekor qilish")
                }
            }
        )
    }

    // Xabar amallari modali (Tahrirlash va O'chirish)
    if (selectedMessageForAction != null) {
        val targetMsg = selectedMessageForAction!!
        val isMyMsg = targetMsg.senderId == currentUser.id

        AlertDialog(
            onDismissRequest = { selectedMessageForAction = null },
            title = {
                Text("Xabar amallari", fontWeight = FontWeight.Bold, color = NavyDark, fontSize = 16.sp)
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (targetMsg.messageType == MessageType.TEXT && isMyMsg) {
                        Surface(
                            onClick = {
                                editingMessage = targetMsg
                                inputText = targetMsg.textContent ?: ""
                                selectedMessageForAction = null
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 12.dp, horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Edit, contentDescription = "Tahrirlash", tint = PrimaryBlue, modifier = Modifier.size(22.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("Tahrirlash", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = NavyDark)
                                    Text("Xabar matnini o'zgartirish", fontSize = 11.sp, color = TextSecondary)
                                }
                            }
                        }
                    }

                    Surface(
                        onClick = {
                            val msgToDelete = targetMsg
                            selectedMessageForAction = null
                            showDeleteConfirmDialog = msgToDelete
                        },
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFFFEBEE),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "O'chirish", tint = StatusRed, modifier = Modifier.size(22.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    if (isMyMsg) "O'chirish (Hamma uchun)" else "Xabarni o'chirish",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = StatusRed
                                )
                                Text("Xabarni butunlay o'chirish", fontSize = 11.sp, color = TextSecondary)
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { selectedMessageForAction = null }) {
                    Text("Bekor qilish", color = TextSecondary)
                }
            }
        )
    }

    // Xabarni o'chirishni tasdiqlash modali
    if (showDeleteConfirmDialog != null) {
        val msgToDelete = showDeleteConfirmDialog!!
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = null },
            title = {
                Text("Xabarni o'chirish", fontWeight = FontWeight.Bold, color = NavyDark)
            },
            text = {
                Text("Haqiqatan ham bu xabarni butunlay o'chirib tashlamoqchimisiz?", fontSize = 14.sp, color = TextSecondary)
            },
            confirmButton = {
                Button(
                    onClick = {
                        storage.deleteMessage(msgToDelete.id)
                        if (editingMessage?.id == msgToDelete.id) {
                            editingMessage = null
                            inputText = ""
                        }
                        showDeleteConfirmDialog = null
                        Toast.makeText(context, "Xabar o'chirildi", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = StatusRed),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("O'chirish", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = null }) {
                    Text("Bekor qilish", color = TextSecondary)
                }
            }
        )
    }

    // Video ijro etish oynasi (In-app Video Player)
    if (playingVideoPath != null) {
        VideoPlayerDialog(
            videoPath = playingVideoPath!!,
            onDismiss = { playingVideoPath = null }
        )
    }
}

@Composable
fun VideoPlayerDialog(
    videoPath: String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            AndroidView(
                modifier = Modifier
                    .fillMaxSize()
                    .align(Alignment.Center),
                factory = { ctx ->
                    VideoView(ctx).apply {
                        val controller = MediaController(ctx)
                        controller.setAnchorView(this)
                        setMediaController(controller)
                        setVideoPath(videoPath)
                        setOnPreparedListener { mp ->
                            mp.isLooping = false
                            start()
                        }
                        setOnErrorListener { _, _, _ ->
                            Toast.makeText(ctx, "Videoni ijro etishda muammo. Tashqi pleyerda ochib ko'ring.", Toast.LENGTH_SHORT).show()
                            true
                        }
                    }
                }
            )

            // Yuqori boshqaruv paneli (Yopish va Tashqi pleyerda ochish)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 24.dp)
                    .align(Alignment.TopCenter),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.65f))
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Yopish", tint = Color.White)
                }

                Text(
                    text = "Video",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )

                IconButton(
                    onClick = {
                        openVideoExternally(context, videoPath)
                    },
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.65f))
                ) {
                    Icon(Icons.Default.Share, contentDescription = "Tashqi pleyer", tint = Color.White)
                }
            }
        }
    }
}

fun openVideoExternally(context: android.content.Context, path: String) {
    try {
        val file = File(path)
        if (!file.exists()) {
            Toast.makeText(context, "Video fayl topilmadi", Toast.LENGTH_SHORT).show()
            return
        }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "video/*")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Videoni pleyerda ochish"))
    } catch (e: Exception) {
        Toast.makeText(context, "Pleyerda ochishda xatolik: ${e.message}", Toast.LENGTH_SHORT).show()
    }
}
