package com.hokimloyha.app.model

import com.google.firebase.database.IgnoreExtraProperties

@IgnoreExtraProperties
data class ScheduleItem(
    val id: String = "",
    val mayorId: String = "",
    val title: String = "",              // Reja matni
    val location: String = "",           // Joylashuv
    val notes: String? = null,           // Qo'shimcha eslatma
    val scheduledTime: Long = 0L,        // Rejalashtirilgan sana va soat
    val voiceBase64: String? = null,     // Birinchi ovoz (moslik uchun)
    val voiceList: List<String> = emptyList(), // Ko'p ovozli xabarlar ro'yxati (Base64)
    val isNotified: Boolean = false,
    val isCompleted: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
) {
    val notificationTime: Long
        get() = scheduledTime - (30 * 60 * 1000L)
}
