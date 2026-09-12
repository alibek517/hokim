package com.hokimloyha.app.model

enum class TaskStatus {
    PENDING_RED,          // QIZIL: Yangi biriktirilgan, ish hali boshlanmagan
    IN_PROGRESS_YELLOW,   // SARIQ: Ishchi ishni boshlagan jarayonda
    COMPLETED_GREEN,      // YASHIL: Ishchi ishni tugatdi deb xabar berdi
    INSPECTED_BLUE        // MOVIY: Hokim borib tekshirdi va tasdiqladi
}

data class TaskItem(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val address: String = "",                    // Masalan: Hamidovjon ko'chasi, 12-uy ro'parasi
    val mayorId: String = "",
    val assignedWorkerId: String = "",
    val assignedWorkerName: String = "",
    val startDate: Long = 0L,                    // Belgilangan boshlanish sanasi va vaqti
    val endDate: Long = 0L,                      // Belgilangan tugash sanasi va vaqti
    val status: TaskStatus = TaskStatus.PENDING_RED,
    val startedAt: Long? = null,
    val completedAt: Long? = null,
    val inspectedAt: Long? = null,
    val startAlertSent: Boolean = false,         // Boshlanmadi degan xabar yuborilganmi
    val deadlineAlertSent: Boolean = false,      // Tugash muddati buzildi degan xabar yuborilganmi
    val completionNotes: String? = null,
    val seenAt: Long? = null,                    // Xodim topshiriqni ko'rgan vaqt
    val seenResponseText: String? = null,        // Xodimning matnli javobi/izohi
    val seenResponseVoicePath: String? = null,   // Lokal audio fayl manzili
    val seenResponseVoiceBase64: String? = null, // Firebase orqali uzatiladigan audio (Base64)
    val seenResponseVoiceDuration: Int = 0,      // Ovoz davomiyligi (sekundlarda)
    val voicePath: String? = null,               // Topshiriqning ovozli fayli (agar ovozli topshiriq bo'lsa)
    val voiceBase64: String? = null,             // Firebase orqali uzatiladigan topshiriq ovozi (Base64)
    val voiceDurationSec: Int = 0,               // Topshiriq ovozi davomiyligi
    val createdAt: Long = System.currentTimeMillis()
)
