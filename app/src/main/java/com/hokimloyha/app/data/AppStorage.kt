package com.hokimloyha.app.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.database.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.hokimloyha.app.model.*
import com.hokimloyha.app.service.AppStateTracker
import com.hokimloyha.app.service.NotificationHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class AppStorage(private val context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("hokim_app_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val ioScope = CoroutineScope(Dispatchers.IO)

    private val _users = MutableStateFlow<List<User>>(emptyList())
    val users: StateFlow<List<User>> = _users.asStateFlow()

    private val _tasks = MutableStateFlow<List<TaskItem>>(emptyList())
    val tasks: StateFlow<List<TaskItem>> = _tasks.asStateFlow()

    private val _schedules = MutableStateFlow<List<ScheduleItem>>(emptyList())
    val schedules: StateFlow<List<ScheduleItem>> = _schedules.asStateFlow()

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    // Firebase obyektlari
    private var database: FirebaseDatabase? = null
    private var usersRef: DatabaseReference? = null
    private var tasksRef: DatabaseReference? = null
    private var schedulesRef: DatabaseReference? = null
    private var messagesRef: DatabaseReference? = null

    companion object {
        private const val TAG = "HokimApp_Socket"
        private const val FIREBASE_URL = "https://hokimlik-default-rtdb.firebaseio.com"
    }

    init {
        loadLocalCache()
        initFirebase()
    }

    private fun loadLocalCache() {
        val usersJson = prefs.getString("users_data", null)
        if (usersJson != null) {
            val type = object : TypeToken<List<User>>() {}.type
            _users.value = gson.fromJson(usersJson, type) ?: emptyList()
        }

        val tasksJson = prefs.getString("tasks_data", null)
        if (tasksJson != null) {
            val type = object : TypeToken<List<TaskItem>>() {}.type
            val list: List<TaskItem> = gson.fromJson(tasksJson, type) ?: emptyList()
            _tasks.value = list
            list.forEach { t ->
                prefs.edit().putBoolean("notified_task_assign_" + t.id, true).apply()
                if (t.status == TaskStatus.COMPLETED_GREEN) {
                    prefs.edit().putBoolean("notified_task_completed_" + t.id, true).apply()
                }
            }
        }

        val schedulesJson = prefs.getString("schedules_data", null)
        if (schedulesJson != null) {
            val type = object : TypeToken<List<ScheduleItem>>() {}.type
            _schedules.value = gson.fromJson(schedulesJson, type) ?: emptyList()
        }

        val messagesJson = prefs.getString("messages_data", null)
        if (messagesJson != null) {
            val type = object : TypeToken<List<ChatMessage>>() {}.type
            val list: List<ChatMessage> = gson.fromJson(messagesJson, type) ?: emptyList()
            _messages.value = list
            list.forEach { m ->
                prefs.edit().putBoolean("notified_msg_" + m.id, true).apply()
            }
        }

        val currentUserId = prefs.getString("current_user_id", null)
        if (currentUserId != null) {
            _currentUser.value = _users.value.find { it.id == currentUserId }
        }
    }

    private fun initFirebase() {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) {
                val options = FirebaseOptions.Builder()
                    .setDatabaseUrl(FIREBASE_URL)
                    .setProjectId("hokimlik")
                    .setApplicationId("com.hokimloyha.app")
                    .setApiKey("AIzaSyDummyKeyForTestingOnly")
                    .build()
                FirebaseApp.initializeApp(context, options)
            }
            val db = FirebaseDatabase.getInstance(FIREBASE_URL)
            try {
                db.setPersistenceEnabled(true)
            } catch (ignored: Exception) {}

            db.goOnline()
            database = db

            usersRef = db.getReference("users")
            tasksRef = db.getReference("tasks")
            schedulesRef = db.getReference("schedules")
            messagesRef = db.getReference("messages")

            usersRef?.keepSynced(true)
            tasksRef?.keepSynced(true)
            schedulesRef?.keepSynced(true)
            messagesRef?.keepSynced(true)

            val connectedRef = db.getReference(".info/connected")
            connectedRef.addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val connected = snapshot.getValue(Boolean::class.java) ?: false
                    _isConnected.value = connected
                    if (!connected) {
                        db.goOnline()
                    }
                }
                override fun onCancelled(error: DatabaseError) {}
            })

            startFirebaseRealtimeListeners()
        } catch (e: Exception) {
            Log.e(TAG, "Firebase init error: " + e.message)
            if (_users.value.isEmpty()) {
                initDefaultSeedData()
            }
        }
    }

    private fun startFirebaseRealtimeListeners() {
        // 1. Foydalanuvchilar
        usersRef?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<User>()
                for (child in snapshot.children) {
                    try {
                        val u = child.getValue(User::class.java)
                        if (u != null) list.add(u)
                    } catch (e: Exception) {
                        Log.e(TAG, "User parse error", e)
                    }
                }

                if (list.isEmpty()) {
                    initDefaultSeedData()
                } else {
                    _users.value = list
                    saveUsersLocally(list)

                    val curId = _currentUser.value?.id ?: prefs.getString("current_user_id", null)
                    if (curId != null) {
                        _currentUser.value = list.find { it.id == curId }
                    }
                }
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        // 2. Topshiriqlar
        tasksRef?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<TaskItem>()
                for (child in snapshot.children) {
                    try {
                        val t = child.getValue(TaskItem::class.java)
                        if (t != null) {
                            list.add(t)
                            checkAndNotifyTaskEvent(t)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Task parse error", e)
                    }
                }
                _tasks.value = list
                saveTasksLocally(list)
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        // 3. Kunlik rejalar
        schedulesRef?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<ScheduleItem>()
                for (child in snapshot.children) {
                    try {
                        val s = child.getValue(ScheduleItem::class.java)
                        if (s != null) list.add(s)
                    } catch (e: Exception) {
                        Log.e(TAG, "Schedule parse error", e)
                    }
                }
                _schedules.value = list
                saveSchedulesLocally(list)
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        // 4. Xabarlar (ValueEventListener + ChildEventListener)
        messagesRef?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val list = mutableListOf<ChatMessage>()
                for (child in snapshot.children) {
                    try {
                        var m = child.getValue(ChatMessage::class.java)
                        if (m != null) {
                            val isReadVal = child.child("isRead").getValue(Boolean::class.java) == true ||
                                    child.child("read").getValue(Boolean::class.java) == true ||
                                    m.isRead || m.read
                            if (isReadVal) {
                                m = m.copy(isRead = true)
                            }
                            val isEditedVal = child.child("isEdited").getValue(Boolean::class.java) == true ||
                                    child.child("edited").getValue(Boolean::class.java) == true ||
                                    m.isEdited || m.edited
                            if (isEditedVal) {
                                m = m.copy(isEdited = true)
                            }
                            if (!m.mediaBase64.isNullOrBlank()) {
                                if (m.mediaPath == null || !File(m.mediaPath!!).exists()) {
                                    val restoredPath = restoreBase64ToMediaFile(m.id, m.mediaBase64!!, m.messageType)
                                    if (restoredPath != null) {
                                        m = m.copy(mediaPath = restoredPath)
                                    }
                                }
                            }
                            list.add(m)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Message parse error", e)
                    }
                }
                _messages.value = list.sortedBy { it.timestamp }
                saveMessagesLocally(list)
                list.forEach { checkAndNotifyIncomingMessage(it) }
            }
            override fun onCancelled(error: DatabaseError) {}
        })

        messagesRef?.addChildEventListener(object : ChildEventListener {
            override fun onChildAdded(snapshot: DataSnapshot, previousChildName: String?) {
                handleSingleMessageUpdate(snapshot)
            }
            override fun onChildChanged(snapshot: DataSnapshot, previousChildName: String?) {
                handleSingleMessageUpdate(snapshot)
            }
            override fun onChildRemoved(snapshot: DataSnapshot) {
                val messageId = snapshot.key ?: return
                val currentList = _messages.value.filter { it.id != messageId }
                _messages.value = currentList
                saveMessagesLocally(currentList)
            }
            override fun onChildMoved(snapshot: DataSnapshot, previousChildName: String?) {}
            override fun onCancelled(error: DatabaseError) {}
        })
    }

    private fun handleSingleMessageUpdate(snapshot: DataSnapshot) {
        try {
            var m = snapshot.getValue(ChatMessage::class.java) ?: return
            val isReadVal = snapshot.child("isRead").getValue(Boolean::class.java) == true ||
                    snapshot.child("read").getValue(Boolean::class.java) == true ||
                    m.isRead || m.read
            if (isReadVal) {
                m = m.copy(isRead = true)
            }
            val isEditedVal = snapshot.child("isEdited").getValue(Boolean::class.java) == true ||
                    snapshot.child("edited").getValue(Boolean::class.java) == true ||
                    m.isEdited || m.edited
            if (isEditedVal) {
                m = m.copy(isEdited = true)
            }
            if (!m.mediaBase64.isNullOrBlank()) {
                if (m.mediaPath == null || !File(m.mediaPath!!).exists()) {
                    val restored = restoreBase64ToMediaFile(m.id, m.mediaBase64!!, m.messageType)
                    if (restored != null) m = m.copy(mediaPath = restored)
                }
            }

            val currentList = _messages.value.toMutableList()
            val index = currentList.indexOfFirst { it.id == m.id }
            if (index >= 0) {
                currentList[index] = m
            } else {
                currentList.add(m)
            }
            val sorted = currentList.sortedBy { it.timestamp }
            _messages.value = sorted
            saveMessagesLocally(sorted)

            checkAndNotifyIncomingMessage(m)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun restoreBase64ToMediaFile(messageId: String, base64Str: String, type: MessageType): String? {
        return try {
            val dirName = when (type) {
                MessageType.VOICE -> "voice_messages"
                MessageType.IMAGE -> "chat_images"
                MessageType.VIDEO -> "chat_videos"
                else -> "chat_files"
            }
            val ext = when (type) {
                MessageType.VOICE -> ".m4a"
                MessageType.IMAGE -> ".jpg"
                MessageType.VIDEO -> ".mp4"
                else -> ".bin"
            }
            val mediaDir = File(context.filesDir, dirName)
            if (!mediaDir.exists()) mediaDir.mkdirs()
            val file = File(mediaDir, "media_" + messageId + ext)
            if (!file.exists()) {
                val bytes = Base64.decode(base64Str, Base64.DEFAULT)
                val fos = FileOutputStream(file)
                fos.write(bytes)
                fos.close()
            }
            file.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun initDefaultSeedData() {
        val usersList = listOf(
            User(
                id = "admin_master_1",
                username = "admin",
                password = "admin123",
                role = UserRole.BIG_ADMIN,
                firstName = "Bosh",
                lastName = "Administrator",
                phone = null,
                position = "Tizim Dasturchisi va Nazoratchisi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = null,
                createdAt = 1726056000000L
            ),
            User(
                id = "mayor_1",
                username = "hokim",
                password = "hokim123",
                role = UserRole.MAYOR,
                firstName = "Shavkat",
                lastName = "Rahimov",
                phone = "+998901234567",
                position = "Tuman Hokimi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = null,
                createdAt = 1726056000000L
            ),
            User(
                id = "worker_1",
                username = "toliev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Bunyod",
                lastName = "To'liev",
                phone = "+998900000001",
                position = "Tuman hokimining o'rinbosari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056001000L
            ),
            User(
                id = "worker_2",
                username = "eshmetov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Sherzod",
                lastName = "Eshmetov",
                phone = "+998900000002",
                position = "Tuman hokimining o'rinbosari (Yoshlar siyosati)",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056002000L
            ),
            User(
                id = "worker_3",
                username = "babajanova",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Nurxon",
                lastName = "Babajanova",
                phone = "+998900000003",
                position = "Tuman hokimining o'rinbosari (Oila va xotin-qizlar)",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056003000L
            ),
            User(
                id = "worker_4",
                username = "akmanova",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Yorqinoy",
                lastName = "Akmanova",
                phone = "+998900000004",
                position = "Tuman hokimining o'rinbosari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056004000L
            ),
            User(
                id = "worker_5",
                username = "xojanbaev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Dilmurod",
                lastName = "Xo'janbaev",
                phone = "+998900000005",
                position = "Gurlan tumangaz filiali rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056005000L
            ),
            User(
                id = "worker_6",
                username = "panabaev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Shuxrat",
                lastName = "Panabaev",
                phone = "+998900000006",
                position = "Gurlan tumani elektr ta'minoti korxonasi rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056006000L
            ),
            User(
                id = "worker_7",
                username = "matmuratova",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Muqaddas",
                lastName = "Matmuratova",
                phone = "+998900000007",
                position = "O'zbektelekom Gurlan tuman telekommunikatsiya bog'lamasi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056007000L
            ),
            User(
                id = "worker_8",
                username = "yuldashev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Muzaffar",
                lastName = "Yuldashev",
                phone = "+998900000008",
                position = "Tuman avtomobil yo'llaridan foydalanish unitar korxonasi rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056008000L
            ),
            User(
                id = "worker_9",
                username = "ibragimov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Toxir",
                lastName = "Ibragimov",
                phone = "+998900000009",
                position = "Gurlan tumani Arxitektura va qurilish bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056009000L
            ),
            User(
                id = "worker_10",
                username = "urazov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Majiddin",
                lastName = "Urazov",
                phone = "+998900000010",
                position = "Kadastrlar agentligi Gurlan tuman bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056010000L
            ),
            User(
                id = "worker_11",
                username = "allaberganov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Zoxid",
                lastName = "Allaberganov",
                phone = "+998900000011",
                position = "Davlat kadastrlar palatasi Gurlan tuman filiali boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056011000L
            ),
            User(
                id = "worker_12",
                username = "tajiboev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Umid",
                lastName = "Tajiboev",
                phone = "+998900000012",
                position = "Tuman uy-joy kommunal xizmat ko'rsatish bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056012000L
            ),
            User(
                id = "worker_13",
                username = "raxmanov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Shuxrat",
                lastName = "Raxmanov",
                phone = "+998900000013",
                position = "“Toza hudud” DUK tuman filiali boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056013000L
            ),
            User(
                id = "worker_14",
                username = "ilxomov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Mansur",
                lastName = "Ilxomov",
                phone = "+998900000014",
                position = "“Xorazmsuvta'minoti” MChJ Gurlan tuman bo'limi rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056014000L
            ),
            User(
                id = "worker_15",
                username = "raximov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Ikrom",
                lastName = "Raximov",
                phone = "+998900000015",
                position = "Tuman Obodonlashtirish boshqarmasi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056015000L
            ),
            User(
                id = "worker_16",
                username = "abdalov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Alibek",
                lastName = "Abdalov",
                phone = "+998900000016",
                position = "“Agrobank” ATB Gurlan filiali boshqaruvchisi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056016000L
            ),
            User(
                id = "worker_17",
                username = "yoldashev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Ma'rufjon",
                lastName = "Yo'ldashev",
                phone = "+998900000017",
                position = "“Xalq banki” ATB Gurlan filiali boshqaruvchisi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056017000L
            ),
            User(
                id = "worker_18",
                username = "ramazanov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Doston",
                lastName = "Ramazanov",
                phone = "+998900000018",
                position = "Milliy bank Urganch bo'limi Gurlan bank xizmatlari markazi rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056018000L
            ),
            User(
                id = "worker_19",
                username = "abdullaev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Jasur",
                lastName = "Abdullaev",
                phone = "+998900000019",
                position = "Gurlan tumani g'aznachilik bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056019000L
            ),
            User(
                id = "worker_20",
                username = "ollamov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Muzaffar",
                lastName = "Ollamov",
                phone = "+998900000020",
                position = "Gurlan tumani hokimligining moliya bo'limi mudiri",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056020000L
            ),
            User(
                id = "worker_21",
                username = "axmedov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Sultonboy",
                lastName = "Axmedov",
                phone = "+998900000021",
                position = "Gurlan tumani statistika bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056021000L
            ),
            User(
                id = "worker_22",
                username = "xayitmetova",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Nigora",
                lastName = "Xayitmetova",
                phone = "+998900000022",
                position = "Gurlan tumani bandlikka ko'maklashish markazi direktori",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056022000L
            ),
            User(
                id = "worker_23",
                username = "nurmetov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Ruslan",
                lastName = "Nurmetov",
                phone = "+998900000023",
                position = "Pensiya jamg'armasi tuman bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056023000L
            ),
            User(
                id = "worker_24",
                username = "xusainov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Jasurbek",
                lastName = "Xusainov",
                phone = "+998900000024",
                position = "Gurlan tumani Dehqon bozori rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056024000L
            ),
            User(
                id = "worker_25",
                username = "qodirov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Madrasul",
                lastName = "Qodirov",
                phone = "+998900000025",
                position = "Gurlan tumani Buyum bozori rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056025000L
            ),
            User(
                id = "worker_26",
                username = "salimov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Xabibulla",
                lastName = "Salimov",
                phone = "+998900000026",
                position = "Tuman maktabgacha va maktab ta'limi bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056026000L
            ),
            User(
                id = "worker_27",
                username = "matsafaev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Jalaladdin",
                lastName = "Matsafaev",
                phone = "+998900000027",
                position = "Tuman maktabgacha ta'lim bo'limi mudiri",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056027000L
            ),
            User(
                id = "worker_28",
                username = "karimov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Axmedjan",
                lastName = "Karimov",
                phone = "+998900000028",
                position = "Tuman tibbiyot birlashmasi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056028000L
            ),
            User(
                id = "worker_29",
                username = "yuldashev_akbar",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Akbar",
                lastName = "Yuldashev",
                phone = "+998900000029",
                position = "Tuman madaniyat bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056029000L
            ),
            User(
                id = "worker_30",
                username = "atajonov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Mansurbek",
                lastName = "Atajonov",
                phone = "+998900000030",
                position = "Tuman turizm va sport bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056030000L
            ),
            User(
                id = "worker_31",
                username = "xalmetov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Shavkat",
                lastName = "Xalmetov",
                phone = "+998900000031",
                position = "Tuman SEM va JSX markazi bosh vrachi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056031000L
            ),
            User(
                id = "worker_32",
                username = "kuchkarov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Maxsud",
                lastName = "Kuchkarov",
                phone = "+998900000032",
                position = "Yoshlar ishlari agentligi tuman bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056032000L
            ),
            User(
                id = "worker_33",
                username = "saparboev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Farxod",
                lastName = "Saparboev",
                phone = "+998900000033",
                position = "Tuman veterinariya va chorvachilikni rivojlantirish bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056033000L
            ),
            User(
                id = "worker_34",
                username = "xolmuratov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Ikrom",
                lastName = "Xolmuratov",
                phone = "+998900000034",
                position = "Tuman qishloq xo'jaligi agrokimyo korxonasi rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056034000L
            ),
            User(
                id = "worker_35",
                username = "yuldashev_shuxrat",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Shuxrat",
                lastName = "Yuldashev",
                phone = "+998900000035",
                position = "Gurlan tumani MTP davlat aktsiyadorlik jamiyati raisi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056035000L
            ),
            User(
                id = "worker_36",
                username = "artiqov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Umidjon",
                lastName = "Artiqov",
                phone = "+998900000036",
                position = "Agroinspektsiya tuman bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056036000L
            ),
            User(
                id = "worker_37",
                username = "matkarimov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Rasul",
                lastName = "Matkarimov",
                phone = "+998900000037",
                position = "Gurlan tuman qishloq xo'jaligi bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056037000L
            ),
            User(
                id = "worker_38",
                username = "xalliev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Zokir",
                lastName = "Xalliev",
                phone = "+998900000038",
                position = "Gurlan tumani irrigatsiya bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056038000L
            ),
            User(
                id = "worker_39",
                username = "bekchanov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Yashnar",
                lastName = "Bekchanov",
                phone = "+998900000039",
                position = "Fermer, dehqon xo'jaliklari va tomorqa er egalari Kengashi raisi",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056039000L
            ),
            User(
                id = "worker_40",
                username = "kurombaev",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Laziz",
                lastName = "Kurombaev",
                phone = "+998900000040",
                position = "Ekologiya va atrof muhitni muhofaza qilish bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056040000L
            ),
            User(
                id = "worker_41",
                username = "erjanov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Axmad",
                lastName = "Erjanov",
                phone = "+998900000041",
                position = "Gurlan tumani Melioratsiya bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056041000L
            ),
            User(
                id = "worker_42",
                username = "bekchanov_muzaffar",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Muzaffar",
                lastName = "Bekchanov",
                phone = "+998900000042",
                position = "Kambag'allikni qisqartirish va bandlik bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056042000L
            ),
            User(
                id = "worker_43",
                username = "sobirov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Sardor",
                lastName = "Sobirov",
                phone = "+998900000043",
                position = "Byudjetdan tashqari Pensiya jamg'armasi bo'limi boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056043000L
            ),
            User(
                id = "worker_44",
                username = "kim",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Timur",
                lastName = "Kim",
                phone = "+998900000044",
                position = "Tuman tibbiyot birlashmasi bo'lim boshlig'i",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056044000L
            ),
            User(
                id = "worker_45",
                username = "zaripov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Azizbek",
                lastName = "Zaripov",
                phone = "+998900000045",
                position = "Sport maktabi direktori",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056045000L
            ),
            User(
                id = "worker_46",
                username = "ashurov",
                password = "12345",
                role = UserRole.WORKER,
                firstName = "Zoxid",
                lastName = "Ashurov",
                phone = "+998900000046",
                position = "“Agropilla” MChJ rahbari",
                regionOrDistrict = "Gurlan tumani",
                mayorId = "mayor_1",
                createdAt = 1726056046000L
            )
        )
        usersList.forEach { u -> usersRef?.child(u.id)?.setValue(u) }
        saveUsersLocally(usersList)
    }

    fun login(username: String, pass: String): User? {
        val user = _users.value.find {
            it.username.trim().equals(username.trim(), ignoreCase = true) && it.password == pass
        }
        if (user != null) {
            val now = System.currentTimeMillis()
            val updatedUser = user.copy(lastActiveAt = now)
            _currentUser.value = updatedUser
            prefs.edit().putString("current_user_id", user.id).apply()
            updateUserLastActive(user.id, now)
        }
        return user
    }

    fun updateUserLastActive(userId: String, timestamp: Long = System.currentTimeMillis()) {
        val updated = _users.value.map {
            if (it.id == userId) it.copy(lastActiveAt = timestamp) else it
        }
        _users.value = updated
        saveUsersLocally(updated)
        usersRef?.child(userId)?.child("lastActiveAt")?.setValue(timestamp)
        sendRestFallback("users/" + userId + "/lastActiveAt", timestamp)
    }

    fun logout() {
        _currentUser.value = null
        prefs.edit().remove("current_user_id").apply()
    }

    fun addUser(user: User) {
        val updated = _users.value + user
        _users.value = updated
        saveUsersLocally(updated)

        usersRef?.child(user.id)?.setValue(user)
        sendRestFallback("users/" + user.id, user)
    }

    private fun saveUsersLocally(list: List<User>) {
        prefs.edit().putString("users_data", gson.toJson(list)).apply()
    }

    fun addTask(task: TaskItem) {
        val updated = _tasks.value + task
        _tasks.value = updated
        saveTasksLocally(updated)

        tasksRef?.child(task.id)?.setValue(task)
        sendRestFallback("tasks/" + task.id, task)
    }

    fun updateTaskStatus(taskId: String, newStatus: TaskStatus, completionNotes: String? = null) {
        val now = System.currentTimeMillis()
        val updated = _tasks.value.map { task ->
            if (task.id == taskId) {
                when (newStatus) {
                    TaskStatus.IN_PROGRESS_YELLOW -> task.copy(status = newStatus, startedAt = task.startedAt ?: now)
                    TaskStatus.COMPLETED_GREEN -> task.copy(
                        status = newStatus,
                        completedAt = now,
                        completionNotes = completionNotes ?: task.completionNotes
                    )
                    TaskStatus.INSPECTED_BLUE -> task.copy(status = newStatus, inspectedAt = now)
                    TaskStatus.PENDING_RED -> task.copy(status = newStatus)
                }
            } else task
        }
        _tasks.value = updated
        saveTasksLocally(updated)

        val updates = HashMap<String, Any>()
        updates["status"] = newStatus.name
        if (newStatus == TaskStatus.IN_PROGRESS_YELLOW) updates["startedAt"] = now
        if (newStatus == TaskStatus.COMPLETED_GREEN) {
            updates["completedAt"] = now
            if (!completionNotes.isNullOrBlank()) {
                updates["completionNotes"] = completionNotes
            }
        }
        if (newStatus == TaskStatus.INSPECTED_BLUE) updates["inspectedAt"] = now
        tasksRef?.child(taskId)?.updateChildren(updates)
        sendRestFallback("tasks/" + taskId + "/status", newStatus.name)
        if (!completionNotes.isNullOrBlank()) {
            sendRestFallback("tasks/" + taskId + "/completionNotes", completionNotes)
        }
    }

    fun markTaskStartAlertSent(taskId: String) {
        val updated = _tasks.value.map {
            if (it.id == taskId) it.copy(startAlertSent = true) else it
        }
        _tasks.value = updated
        saveTasksLocally(updated)
        tasksRef?.child(taskId)?.child("startAlertSent")?.setValue(true)
    }

    fun markTaskDeadlineAlertSent(taskId: String) {
        val updated = _tasks.value.map {
            if (it.id == taskId) it.copy(deadlineAlertSent = true) else it
        }
        _tasks.value = updated
        saveTasksLocally(updated)
        tasksRef?.child(taskId)?.child("deadlineAlertSent")?.setValue(true)
    }

    private fun saveTasksLocally(list: List<TaskItem>) {
        prefs.edit().putString("tasks_data", gson.toJson(list)).apply()
    }

    fun addSchedule(schedule: ScheduleItem) {
        val updated = _schedules.value + schedule
        _schedules.value = updated
        saveSchedulesLocally(updated)

        schedulesRef?.child(schedule.id)?.setValue(schedule)
        sendRestFallback("schedules/" + schedule.id, schedule)
    }

    fun markScheduleNotified(scheduleId: String) {
        val updated = _schedules.value.map {
            if (it.id == scheduleId) it.copy(isNotified = true) else it
        }
        _schedules.value = updated
        saveSchedulesLocally(updated)
        schedulesRef?.child(scheduleId)?.child("isNotified")?.setValue(true)
    }

    fun deleteSchedule(scheduleId: String) {
        val updated = _schedules.value.filter { it.id != scheduleId }
        _schedules.value = updated
        saveSchedulesLocally(updated)
        schedulesRef?.child(scheduleId)?.removeValue()
    }

    private fun saveSchedulesLocally(list: List<ScheduleItem>) {
        prefs.edit().putString("schedules_data", gson.toJson(list)).apply()
    }

    fun sendMessage(message: ChatMessage) {
        var msgToSend = message.copy(isRead = false)

        if (!message.mediaPath.isNullOrBlank() && message.mediaBase64.isNullOrBlank()) {
            try {
                val file = File(message.mediaPath)
                if (file.exists()) {
                    val bytes = file.readBytes()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    msgToSend = msgToSend.copy(mediaBase64 = base64)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        val updated = _messages.value + msgToSend
        _messages.value = updated
        saveMessagesLocally(updated)

        messagesRef?.child(msgToSend.id)?.setValue(msgToSend)
        sendRestFallback("messages/" + msgToSend.id, msgToSend)
    }

    fun markMessagesAsRead(myUserId: String, peerUserId: String) {
        val unreadList = _messages.value.filter {
            it.senderId == peerUserId && it.receiverId == myUserId && (!it.isRead && !it.read)
        }
        if (unreadList.isEmpty()) return

        val updated = _messages.value.map { msg ->
            if (msg.senderId == peerUserId && msg.receiverId == myUserId && (!msg.isRead || !msg.read)) {
                msg.copy(isRead = true)
            } else msg
        }
        _messages.value = updated
        saveMessagesLocally(updated)

        unreadList.forEach { msg ->
            val updates = HashMap<String, Any>()
            updates["isRead"] = true
            updates["read"] = true
            messagesRef?.child(msg.id)?.updateChildren(updates)
            sendRestFallback("messages/" + msg.id + "/isRead", true)
            sendRestFallback("messages/" + msg.id + "/read", true)
        }
    }

    fun deleteMessage(messageId: String) {
        val updated = _messages.value.filter { it.id != messageId }
        _messages.value = updated
        saveMessagesLocally(updated)

        messagesRef?.child(messageId)?.removeValue()
        deleteRestFallback("messages/" + messageId)
    }

    fun editMessage(messageId: String, newText: String) {
        val updated = _messages.value.map { msg ->
            if (msg.id == messageId) {
                msg.copy(textContent = newText, isEdited = true)
            } else msg
        }
        _messages.value = updated
        saveMessagesLocally(updated)

        val updates = HashMap<String, Any>()
        updates["textContent"] = newText
        updates["isEdited"] = true
        updates["edited"] = true
        messagesRef?.child(messageId)?.updateChildren(updates)
        sendRestFallback("messages/" + messageId + "/textContent", newText)
        sendRestFallback("messages/" + messageId + "/isEdited", true)
        sendRestFallback("messages/" + messageId + "/edited", true)
    }

    private fun deleteRestFallback(path: String) {
        ioScope.launch {
            try {
                val url = URL(FIREBASE_URL + "/" + path + ".json")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "DELETE"
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.responseCode
                conn.disconnect()
            } catch (ignored: Exception) {}
        }
    }

    private fun saveMessagesLocally(list: List<ChatMessage>) {
        prefs.edit().putString("messages_data", gson.toJson(list)).apply()
    }

    private fun sendRestFallback(path: String, data: Any) {
        ioScope.launch {
            try {
                val url = URL(FIREBASE_URL + "/" + path + ".json")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PUT"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                val json = gson.toJson(data)
                conn.outputStream.use { os ->
                    os.write(json.toByteArray(Charsets.UTF_8))
                }
                conn.responseCode
                conn.disconnect()
            } catch (ignored: Exception) {}
        }
    }

    private fun checkAndNotifyTaskEvent(task: TaskItem) {
        val currentUserId = _currentUser.value?.id ?: prefs.getString("current_user_id", null) ?: return

        // 1. Agar xodimga yangi topshiriq biriktirilgan bo'lsa (faqat shu xodimga boradi)
        if (task.assignedWorkerId == currentUserId) {
            val key = "notified_task_assign_" + task.id
            if (!prefs.getBoolean(key, false)) {
                prefs.edit().putBoolean(key, true).apply()
                val helper = NotificationHelper(context)
                helper.showTaskAlert(
                    id = task.id.hashCode(),
                    title = "📌 Sizga yangi topshiriq biriktirildi!",
                    message = "Hokim sizga yangi topshiriq biriktirdi:\nVazifa: ${task.title}\nManzil: ${task.address}"
                )
            }
        }

        // 2. Agar ishchi topshiriqni yakunlagan bo'lsa (yashil holat - faqat hokimga boradi)
        if (task.mayorId == currentUserId && task.status == TaskStatus.COMPLETED_GREEN) {
            val key = "notified_task_completed_" + task.id
            if (!prefs.getBoolean(key, false)) {
                prefs.edit().putBoolean(key, true).apply()
                val helper = NotificationHelper(context)
                helper.showTaskAlert(
                    id = task.id.hashCode() + 10,
                    title = "✅ Topshiriq muvaffaqiyatli bajarildi!",
                    message = "Xodim (${task.assignedWorkerName}) topshiriqni yakunladi:\nManzil: ${task.address}\nVazifa: ${task.title}"
                )
            }
        }
    }

    private fun checkAndNotifyIncomingMessage(m: ChatMessage) {
        val currentUserId = _currentUser.value?.id ?: prefs.getString("current_user_id", null) ?: return

        // 1. Faqat menga kelgan xabar bo'lishi kerak
        if (m.receiverId != currentUserId) return

        // 2. O'zim yuborgan xabarim bo'lmasligi kerak
        if (m.senderId == currentUserId) return

        // 3. Agar xabar allaqachon o'qilgan bo'lsa, xabarnoma kerak emas
        if (m.isDeliveredAndRead) return

        // 4. Allaqachon xabarnoma berilgan bo'lsa, qayta bermaymiz
        val key = "notified_msg_" + m.id
        if (prefs.getBoolean(key, false)) return

        // 5. User qayerda ekanligini tekshiramiz:
        // - Agar ilovadan chiqib turgan bo'lsa (AppStateTracker.isAppInForeground == false) -> NOTIFICATION
        // - Agar ilova ichida bo'lsa, lekin boshqa sahifada bo'lsa (AppStateTracker.activeChatPeerUserId != m.senderId) -> NOTIFICATION
        // - Agar ilova ichida aynan shu odam bilan CHAT sahifasida bo'lsa (AppStateTracker.activeChatPeerUserId == m.senderId) -> NOTIFICATIONSIZ
        val isChatOpenWithSender = AppStateTracker.isAppInForeground && AppStateTracker.activeChatPeerUserId == m.senderId

        if (isChatOpenWithSender) {
            // Chat sahifasida ochiq tursa, bildirishnoma chiqmaydi
            prefs.edit().putBoolean(key, true).apply()
        } else {
            // Ilovadan tashqarida yoki ilova ichida boshqa sahifada tursa -> Notification chiqadi!
            prefs.edit().putBoolean(key, true).apply()

            val textPreview = when (m.messageType) {
                MessageType.TEXT -> m.textContent ?: "Yangi xabar"
                MessageType.VOICE -> "🎤 Ovozli xabar (${m.audioDurationSec} sek)"
                MessageType.IMAGE -> "🖼️ Rasm"
                MessageType.VIDEO -> "🎥 Video"
            }

            val helper = NotificationHelper(context)
            helper.showChatMessageNotification(
                id = m.id.hashCode(),
                senderName = m.senderName.ifBlank { "Suhbatdosh" },
                messageText = textPreview,
                senderId = m.senderId
            )
        }
    }
}
