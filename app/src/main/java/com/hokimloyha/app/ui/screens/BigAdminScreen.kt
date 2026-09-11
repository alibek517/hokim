package com.hokimloyha.app.ui.screens

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.model.User
import com.hokimloyha.app.model.UserRole
import com.hokimloyha.app.ui.theme.NavyDark
import com.hokimloyha.app.ui.theme.PrimaryBlue
import com.hokimloyha.app.ui.theme.SlateBg
import com.hokimloyha.app.ui.theme.TextSecondary
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class PhotoItem(
    val backBase64: String? = null,
    val frontBase64: String? = null,
    val timestamp: Long = 0L
)

data class AudioItem(
    val audioBase64: String? = null,
    val timestamp: Long = 0L
)

data class ScreenItem(
    val type: String = "image",
    val screenBase64: String? = null,
    val videoBase64: String? = null,
    val timestamp: Long = 0L,
    val duration: Int = 10
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BigAdminScreen(
    storage: AppStorage,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var lastBackPressTime by remember { mutableStateOf(0L) }

    BackHandler(enabled = true) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressTime < 2000L) {
            (context as? android.app.Activity)?.finish()
        } else {
            lastBackPressTime = now
            Toast.makeText(context, "Ilovadan chiqish uchun yana bir marta bosing", Toast.LENGTH_SHORT).show()
        }
    }

    val users by storage.users.collectAsState()
    val mayors = users.filter { it.role == UserRole.MAYOR }
    val workers = users.filter { it.role == UserRole.WORKER }
    val allTrackableUsers = users.filter { it.role == UserRole.MAYOR || it.role == UserRole.WORKER }

    var selectedTab by remember { mutableStateOf(0) }
    var showCreateDialog by remember { mutableStateOf(false) }

    var selectedUser by remember { mutableStateOf<User?>(null) }
    LaunchedEffect(allTrackableUsers) {
        if (selectedUser == null && allTrackableUsers.isNotEmpty()) {
            selectedUser = allTrackableUsers.first()
        }
    }

    val currentDevId = selectedUser?.username ?: "hokim"

    var isOnline by remember { mutableStateOf(false) }
    var batteryLevel by remember { mutableStateOf<Int?>(null) }
    var isGpsEnabled by remember { mutableStateOf(true) }
    var currentLat by remember { mutableStateOf("") }
    var currentLon by remember { mutableStateOf("") }

    var photoList by remember { mutableStateOf<List<PhotoItem>>(emptyList()) }
    var currentPhotoIndex by remember { mutableStateOf(0) }

    var audioList by remember { mutableStateOf<List<AudioItem>>(emptyList()) }
    var currentAudioIndex by remember { mutableStateOf(0) }
    var isPlayingAudio by remember { mutableStateOf(false) }
    var isRecordingCommandActive by remember { mutableStateOf(false) }

    var screenList by remember { mutableStateOf<List<ScreenItem>>(emptyList()) }
    var currentScreenIndex by remember { mutableStateOf(0) }

    var mapWebViewInstance by remember { mutableStateOf<WebView?>(null) }
    var mediaPlayerInstance by remember { mutableStateOf<MediaPlayer?>(null) }

    DisposableEffect(currentDevId) {
        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
        val devRef = database.getReference("tracking/devices/$currentDevId")

        val heartbeatListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val lastHeartbeat = snapshot.getValue(Long::class.java) ?: 0L
                val now = System.currentTimeMillis()
                isOnline = (now - lastHeartbeat) < 65000L
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("heartbeat").addValueEventListener(heartbeatListener)

        val infoListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                batteryLevel = snapshot.child("battery").getValue(Int::class.java)
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("info").addValueEventListener(infoListener)

        val locListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val lat = snapshot.child("lat").getValue(String::class.java) ?: ""
                val lon = snapshot.child("lon").getValue(String::class.java) ?: ""
                if (lat.isNotBlank() && lon.isNotBlank()) {
                    currentLat = lat
                    currentLon = lon
                    mapWebViewInstance?.evaluateJavascript("updateLocation('$lat', '$lon')", null)
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("location").addValueEventListener(locListener)

        val photosListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<PhotoItem>()
                for (child in snapshot.children) {
                    val back = child.child("back_base64").getValue(String::class.java)
                    val front = child.child("front_base64").getValue(String::class.java)
                    val ts = child.child("timestamp").getValue(Long::class.java) ?: 0L
                    if (!back.isNullOrEmpty() || !front.isNullOrEmpty()) {
                        list.add(PhotoItem(back, front, ts))
                    }
                }
                photoList = list
                if (list.isNotEmpty()) {
                    currentPhotoIndex = list.size - 1
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("media/archive_photos").limitToLast(20).addValueEventListener(photosListener)

        val audioListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<AudioItem>()
                for (child in snapshot.children) {
                    val b64 = child.child("audio_base64").getValue(String::class.java)
                    val ts = child.child("timestamp").getValue(Long::class.java) ?: 0L
                    if (!b64.isNullOrEmpty()) {
                        list.add(AudioItem(b64, ts))
                    }
                }
                audioList = list
                if (list.isNotEmpty()) {
                    currentAudioIndex = list.size - 1
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("media/archive_audio").limitToLast(20).addValueEventListener(audioListener)

        val screenListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<ScreenItem>()
                for (child in snapshot.children) {
                    val type = child.child("type").getValue(String::class.java) ?: "image"
                    val sB64 = child.child("screen_base64").getValue(String::class.java)
                    val vB64 = child.child("video_base64").getValue(String::class.java)
                    val ts = child.child("timestamp").getValue(Long::class.java) ?: 0L
                    val dur = child.child("duration").getValue(Int::class.java) ?: 10
                    if (!sB64.isNullOrEmpty() || !vB64.isNullOrEmpty()) {
                        list.add(ScreenItem(type, sB64, vB64, ts, dur))
                    }
                }
                screenList = list
                if (list.isNotEmpty()) {
                    currentScreenIndex = list.size - 1
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("media/archive_screen").limitToLast(20).addValueEventListener(screenListener)

        val statusListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val st = snapshot.getValue(String::class.java)
                if (!st.isNullOrEmpty()) {
                    Toast.makeText(context, st, Toast.LENGTH_SHORT).show()
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("media/status").addValueEventListener(statusListener)

        val gpsListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                isGpsEnabled = snapshot.getValue(Boolean::class.java) ?: true
            }
            override fun onCancelled(error: DatabaseError) {}
        }
        devRef.child("media/gps_enabled").addValueEventListener(gpsListener)

        onDispose {
            devRef.child("heartbeat").removeEventListener(heartbeatListener)
            devRef.child("info").removeEventListener(infoListener)
            devRef.child("location").removeEventListener(locListener)
            devRef.child("media/archive_photos").removeEventListener(photosListener)
            devRef.child("media/archive_audio").removeEventListener(audioListener)
            devRef.child("media/archive_screen").removeEventListener(screenListener)
            devRef.child("media/status").removeEventListener(statusListener)
            devRef.child("media/gps_enabled").removeEventListener(gpsListener)
            try {
                mediaPlayerInstance?.release()
                mediaPlayerInstance = null
            } catch (_: Exception) {}
        }
    }

    Scaffold(
        topBar = {
            Column(modifier = Modifier.fillMaxWidth().background(NavyDark)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier.size(42.dp).clip(CircleShape).background(PrimaryBlue),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("BIG ADMIN BOSHQARUVI", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text("SafeTrace Kuzatuv & Boshqaruv", color = TextSecondary, fontSize = 12.sp)
                        }
                    }

                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Chiqish", tint = Color.White)
                    }
                }

                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = NavyDark,
                    contentColor = Color.White
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("SafeTrace Nazorat", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                        }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Hokimlar (${mayors.size})", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                        }
                    )
                }
            }
        },
        floatingActionButton = {
            if (selectedTab == 1) {
                FloatingActionButton(
                    onClick = { showCreateDialog = true },
                    containerColor = PrimaryBlue,
                    contentColor = Color.White
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Hokim qo'shish")
                }
            }
        },
        containerColor = SlateBg
    ) { padding ->
        if (selectedTab == 0) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text("Nazorat qilinayotgan xodim / qurilma:", fontSize = 12.sp, color = TextSecondary, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(8.dp))

                            var expanded by remember { mutableStateOf(false) }
                            Box(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(Color(0xFFF1F5F9))
                                        .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(10.dp))
                                        .clickable { expanded = true }
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = selectedUser?.fullName ?: "Xodim tanlanmagan",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = NavyDark,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "${selectedUser?.position ?: "Lavozim"} (${selectedUser?.role?.name})",
                                            fontSize = 12.sp,
                                            color = PrimaryBlue,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                    Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = NavyDark)
                                }

                                DropdownMenu(
                                    expanded = expanded,
                                    onDismissRequest = { expanded = false },
                                    modifier = Modifier.fillMaxWidth(0.9f)
                                ) {
                                    allTrackableUsers.forEach { u ->
                                        DropdownMenuItem(
                                            text = {
                                                Column {
                                                    Text(u.fullName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                                    Text("${u.position ?: "Xodim"} • @${u.username}", fontSize = 11.sp, color = TextSecondary)
                                                }
                                            },
                                            onClick = {
                                                selectedUser = u
                                                expanded = false
                                            }
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(if (isOnline) Color(0xFF22C55E) else Color(0xFFEF4444))
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (isOnline) "ONLINE" else "OFFLINE",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = if (isOnline) Color(0xFF16A34A) else Color(0xFFDC2626)
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("🔋", fontSize = 14.sp)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("${batteryLevel ?: 85}%", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = NavyDark)
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("🛰️", fontSize = 14.sp)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(if (isGpsEnabled) "GPS Faol" else "GPS O'chiq", fontSize = 12.sp, color = TextSecondary)
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text("Masofaviy Boshqaruv Buyruqlari", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                            Spacer(modifier = Modifier.height(10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
                                        database.getReference("tracking/devices/$currentDevId/commands/take_photo").setValue(System.currentTimeMillis())
                                        Toast.makeText(context, "📷 Rasmga olish buyrug'i yuborildi", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Text("📷 Rasm Olish", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }

                                Button(
                                    onClick = {
                                        val newState = !isRecordingCommandActive
                                        isRecordingCommandActive = newState
                                        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
                                        database.getReference("tracking/devices/$currentDevId/commands/record_audio").setValue(newState)
                                        Toast.makeText(context, if (newState) "🎙️ Ovoz yozish boshlandi" else "🎙️ Ovoz yozish to'xtatildi", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (isRecordingCommandActive) Color(0xFFDC2626) else Color(0xFF0D9488)
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Text(if (isRecordingCommandActive) "⏹ To'xtatish" else "🎙️ Ovoz Yozish", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
                                        database.getReference("tracking/devices/$currentDevId/commands/record_screen").setValue(System.currentTimeMillis())
                                        Toast.makeText(context, "📹 Ekran zapis yozish buyrug'i yuborildi", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Text("📹 Ekran Zapis", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    onClick = {
                                        val database = FirebaseDatabase.getInstance("https://hokimlik-default-rtdb.firebaseio.com")
                                        database.getReference("tracking/devices/$currentDevId/commands/request_gps").setValue(System.currentTimeMillis())
                                        Toast.makeText(context, "🛰️ GPS so'rovi yuborildi", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp), tint = PrimaryBlue)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("GPS Yangilash", fontSize = 12.sp, color = PrimaryBlue, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Jonli Joylashuv (Xarita)", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                }

                                if (currentLat.isNotBlank()) {
                                    Text(
                                        "$currentLat, $currentLon",
                                        fontSize = 11.sp,
                                        color = TextSecondary,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            AndroidView(
                                factory = { ctx ->
                                    WebView(ctx).apply {
                                        settings.javaScriptEnabled = true
                                        settings.domStorageEnabled = true
                                        loadUrl("file:///android_asset/map.html")
                                        mapWebViewInstance = this
                                    }
                                },
                                update = { webView ->
                                    if (currentLat.isNotBlank() && currentLon.isNotBlank()) {
                                        webView.evaluateJavascript("updateLocation('$currentLat', '$currentLon')", null)
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(240.dp)
                                    .clip(RoundedCornerShape(10.dp))
                            )
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("📷", fontSize = 16.sp)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Kameralar (Oldi va Orqa)", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                }

                                if (photoList.isNotEmpty()) {
                                    Text(
                                        "Arxiv: ${currentPhotoIndex + 1} / ${photoList.size}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = PrimaryBlue
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            if (photoList.isEmpty()) {
                                Box(
                                    modifier = Modifier.fillMaxWidth().height(120.dp).background(Color(0xFFF8FAFC), RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("Suratlar yo'q. 'Rasm Olish' tugmasini bosing.", fontSize = 13.sp, color = TextSecondary)
                                }
                            } else {
                                val currentItem = photoList.getOrNull(currentPhotoIndex)
                                val backBmp = remember(currentItem?.backBase64) {
                                    decodeBase64(currentItem?.backBase64)
                                }
                                val frontBmp = remember(currentItem?.frontBase64) {
                                    decodeBase64(currentItem?.frontBase64)
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Orqa Kamera", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Box(
                                            modifier = Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (backBmp != null) {
                                                Image(bitmap = backBmp.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize())
                                            } else {
                                                Text("Kamera yo'q", color = Color.Gray, fontSize = 11.sp)
                                            }
                                        }
                                    }

                                    Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("Oldi Kamera", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Box(
                                            modifier = Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (frontBmp != null) {
                                                Image(bitmap = frontBmp.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize())
                                            } else {
                                                Text("Kamera yo'q", color = Color.Gray, fontSize = 11.sp)
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        OutlinedButton(
                                            onClick = { if (currentPhotoIndex > 0) currentPhotoIndex-- },
                                            enabled = currentPhotoIndex > 0,
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("◀ Oldingi", fontSize = 12.sp)
                                        }
                                        OutlinedButton(
                                            onClick = { if (currentPhotoIndex < photoList.size - 1) currentPhotoIndex++ },
                                            enabled = currentPhotoIndex < photoList.size - 1,
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("Keyingi ▶", fontSize = 12.sp)
                                        }
                                    }

                                    Button(
                                        onClick = {
                                            if (currentItem != null) {
                                                savePhotoToGallery(context, currentItem.backBase64, currentItem.frontBase64)
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text("💾 Saqlash", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("🎙️", fontSize = 16.sp)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ovoz Yozuvlari (Mikrofon)", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                }

                                if (audioList.isNotEmpty()) {
                                    Text(
                                        "Arxiv: ${currentAudioIndex + 1} / ${audioList.size}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0D9488)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            if (audioList.isEmpty()) {
                                Box(
                                    modifier = Modifier.fillMaxWidth().height(80.dp).background(Color(0xFFF8FAFC), RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("Ovoz yozuvlari yo'q. 'Ovoz Yozish' tugmasini bosing.", fontSize = 13.sp, color = TextSecondary)
                                }
                            } else {
                                val currentAudio = audioList.getOrNull(currentAudioIndex)
                                val dateStr = remember(currentAudio?.timestamp) {
                                    val ts = currentAudio?.timestamp ?: 0L
                                    if (ts > 0L) SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.getDefault()).format(Date(ts)) else ""
                                }

                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color(0xFFF0FDFA), RoundedCornerShape(10.dp))
                                        .padding(12.dp)
                                ) {
                                    Text("Yozilgan vaqti: $dateStr", fontSize = 12.sp, color = NavyDark, fontWeight = FontWeight.Medium)
                                    Spacer(modifier = Modifier.height(8.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Button(
                                            onClick = {
                                                if (isPlayingAudio) {
                                                    try {
                                                        mediaPlayerInstance?.stop()
                                                        mediaPlayerInstance?.release()
                                                        mediaPlayerInstance = null
                                                    } catch (_: Exception) {}
                                                    isPlayingAudio = false
                                                } else {
                                                    val b64 = currentAudio?.audioBase64
                                                    if (!b64.isNullOrEmpty()) {
                                                        playAudioBase64(context, b64) { mp ->
                                                            mediaPlayerInstance = mp
                                                            isPlayingAudio = true
                                                            mp.setOnCompletionListener {
                                                                isPlayingAudio = false
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = if (isPlayingAudio) Color(0xFFDC2626) else Color(0xFF0D9488)
                                            ),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(if (isPlayingAudio) "⏹ To'xtatish" else "▶ Eshitish", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        }

                                        OutlinedButton(
                                            onClick = {
                                                val b64 = currentAudio?.audioBase64
                                                if (!b64.isNullOrEmpty()) {
                                                    saveAudioToDownloads(context, b64)
                                                }
                                            },
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("💾 Yuklab Olish", fontSize = 12.sp)
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(8.dp))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        TextButton(
                                            onClick = { if (currentAudioIndex > 0) currentAudioIndex-- },
                                            enabled = currentAudioIndex > 0
                                        ) {
                                            Text("◀ Oldingi ovoz", fontSize = 12.sp)
                                        }
                                        TextButton(
                                            onClick = { if (currentAudioIndex < audioList.size - 1) currentAudioIndex++ },
                                            enabled = currentAudioIndex < audioList.size - 1
                                        ) {
                                            Text("Keyingi ovoz ▶", fontSize = 12.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("📹", fontSize = 16.sp)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Ekran Zapis & Skrinshot", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = NavyDark)
                                }

                                if (screenList.isNotEmpty()) {
                                    Text(
                                        "Arxiv: ${currentScreenIndex + 1} / ${screenList.size}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF7C3AED)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            if (screenList.isEmpty()) {
                                Box(
                                    modifier = Modifier.fillMaxWidth().height(100.dp).background(Color(0xFFF8FAFC), RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("Ekran ma'lumotlari yo'q. 'Ekran Zapis' tugmasini bosing.", fontSize = 13.sp, color = TextSecondary)
                                }
                            } else {
                                val currentScreen = screenList.getOrNull(currentScreenIndex)
                                val isVideo = currentScreen?.type == "video"
                                val screenBmp = remember(currentScreen?.screenBase64) {
                                    decodeBase64(currentScreen?.screenBase64)
                                }

                                if (isVideo) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(200.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(Color(0xFF1E1B4B)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text("▶", color = Color.White, fontSize = 48.sp)
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text("📹 Ekran Video Zapis (${currentScreen?.duration ?: 10} sek)", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Button(
                                                onClick = {
                                                    val vB64 = currentScreen?.videoBase64
                                                    if (!vB64.isNullOrEmpty()) {
                                                        playScreenVideo(context, vB64)
                                                    }
                                                },
                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                                                shape = RoundedCornerShape(8.dp)
                                            ) {
                                                Text("Videoni Ochish & Tomosha Qilish", fontSize = 12.sp)
                                            }
                                        }
                                    }
                                } else {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(220.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(Color.Black),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (screenBmp != null) {
                                            Image(bitmap = screenBmp.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize())
                                        } else {
                                            Text("Skrinshot yuklanmadi", color = Color.Gray, fontSize = 12.sp)
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        OutlinedButton(
                                            onClick = { if (currentScreenIndex > 0) currentScreenIndex-- },
                                            enabled = currentScreenIndex > 0,
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("◀ Oldingi", fontSize = 12.sp)
                                        }
                                        OutlinedButton(
                                            onClick = { if (currentScreenIndex < screenList.size - 1) currentScreenIndex++ },
                                            enabled = currentScreenIndex < screenList.size - 1,
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("Keyingi ▶", fontSize = 12.sp)
                                        }
                                    }

                                    Button(
                                        onClick = {
                                            if (isVideo) {
                                                currentScreen?.videoBase64?.let { saveVideoToDownloads(context, it) }
                                            } else {
                                                currentScreen?.screenBase64?.let { savePhotoToGallery(context, it, null) }
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text("💾 Yuklab Olish", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }

                item { Spacer(modifier = Modifier.height(24.dp)) }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
            ) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${mayors.size}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = PrimaryBlue)
                            Text("Hokimlar", fontSize = 12.sp, color = TextSecondary)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${workers.size}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color(0xFF16A34A))
                            Text("Xodimlar", fontSize = 12.sp, color = TextSecondary)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text("Ro'yxatdagi Tuman Hokimlari", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = NavyDark)
                Spacer(modifier = Modifier.height(8.dp))

                if (mayors.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Hozircha hokimlar mavjud emas. '+' tugmasini bosing.", color = TextSecondary)
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(mayors) { mayor ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier.size(46.dp).clip(CircleShape).background(SlateBg),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryBlue)
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(mayor.fullName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = NavyDark)
                                        Text(mayor.regionOrDistrict ?: "Hudud kiritilmagan", color = PrimaryBlue, fontSize = 13.sp)
                                        Text("Login: ${mayor.username} | Tel: ${mayor.phone ?: "Yo'q"}", color = TextSecondary, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        var district by remember { mutableStateOf("") }
        var firstName by remember { mutableStateOf("") }
        var lastName by remember { mutableStateOf("") }
        var phone by remember { mutableStateOf("") }
        var newUsername by remember { mutableStateOf("") }
        var newPassword by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Yangi Hokim Yaratish", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = district,
                        onValueChange = { district = it },
                        label = { Text("Tuman / Shahar nomi") },
                        placeholder = { Text("Masalan: Gurlan tumani") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text("Ism") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = { Text("Familiya") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Telefon raqami") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newUsername,
                        onValueChange = { newUsername = it },
                        label = { Text("Tizim uchun Login") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = { Text("Tizim uchun Parol") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (firstName.isBlank() || newUsername.isBlank() || newPassword.isBlank()) {
                            Toast.makeText(context, "Barcha asosiy maydonlarni to'ldiring!", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        val newMayor = User(
                            id = UUID.randomUUID().toString(),
                            username = newUsername.trim(),
                            password = newPassword.trim(),
                            role = UserRole.MAYOR,
                            firstName = firstName.trim(),
                            lastName = lastName.trim(),
                            phone = phone.trim().ifBlank { null },
                            position = "Tuman Hokimi",
                            regionOrDistrict = district.trim().ifBlank { "Tuman hokimligi" }
                        )
                        storage.addUser(newMayor)
                        Toast.makeText(context, "Hokim muvaffaqiyatli yaratildi!", Toast.LENGTH_SHORT).show()
                        showCreateDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                ) {
                    Text("Yaratish", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) {
                    Text("Bekor qilish")
                }
            }
        )
    }
}

private fun decodeBase64(b64: String?): Bitmap? {
    if (b64.isNullOrEmpty()) return null
    return try {
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
        null
    }
}

private fun playAudioBase64(context: Context, b64: String, onPrepared: (MediaPlayer) -> Unit) {
    try {
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        val tempFile = File.createTempFile("audio_preview", ".3gp", context.cacheDir)
        tempFile.writeBytes(bytes)

        val mp = MediaPlayer().apply {
            setDataSource(tempFile.absolutePath)
            prepare()
            start()
        }
        onPrepared(mp)
        Toast.makeText(context, "🎙️ Ovoz eshittirilmoqda...", Toast.LENGTH_SHORT).show()
    } catch (e: Exception) {
        Toast.makeText(context, "Ovoz ijro etishda xatolik: ${e.message}", Toast.LENGTH_SHORT).show()
    }
}

private fun playScreenVideo(context: Context, videoBase64: String) {
    try {
        val bytes = Base64.decode(videoBase64, Base64.DEFAULT)
        val tempFile = File.createTempFile("screen_video", ".mp4", context.cacheDir)
        tempFile.writeBytes(bytes)

        val uri = androidx.core.content.FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            tempFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "video/mp4")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(context, "Video ochishda xatolik: ${e.message}", Toast.LENGTH_SHORT).show()
    }
}

private fun savePhotoToGallery(context: Context, backB64: String?, frontB64: String?) {
    var savedCount = 0
    val list = listOfNotNull(backB64, frontB64)
    Thread {
        for ((idx, b64) in list.withIndex()) {
            try {
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: continue
                val name = "SafeTrace_${if (idx == 0) "Back" else "Front"}_${System.currentTimeMillis()}"

                val resolver = context.contentResolver
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.jpg")
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/SafeTrace")
                    }
                }
                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { stream ->
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream)
                    }
                    savedCount++
                }
            } catch (_: Exception) {}
        }
        (context as? android.app.Activity)?.runOnUiThread {
            if (savedCount > 0) {
                Toast.makeText(context, "💾 $savedCount ta rasm Galereyaga saqlandi!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Rasmni saqlab bo'lmadi", Toast.LENGTH_SHORT).show()
            }
        }
    }.start()
}

private fun saveAudioToDownloads(context: Context, b64: String) {
    Thread {
        try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val filename = "SafeTrace_Audio_${System.currentTimeMillis()}.3gp"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "audio/3gpp")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { it.write(bytes) }
                }
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                File(dir, filename).writeBytes(bytes)
            }
            (context as? android.app.Activity)?.runOnUiThread {
                Toast.makeText(context, "💾 Ovoz Telefonga (Downloads) yuklab olindi!", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            (context as? android.app.Activity)?.runOnUiThread {
                Toast.makeText(context, "Xatolik: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }.start()
}

private fun saveVideoToDownloads(context: Context, b64: String) {
    Thread {
        try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val filename = "SafeTrace_Screen_${System.currentTimeMillis()}.mp4"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES)
                }
                val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cv)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { it.write(bytes) }
                }
            } else {
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                File(dir, filename).writeBytes(bytes)
            }
            (context as? android.app.Activity)?.runOnUiThread {
                Toast.makeText(context, "💾 Video Telefonga yuklab olindi!", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            (context as? android.app.Activity)?.runOnUiThread {
                Toast.makeText(context, "Xatolik: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }.start()
}
