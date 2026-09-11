package com.hokimloyha.app.model

data class ScheduleItem(
    val id: String = "",
    val mayorId: String = "",
    val title: String = "",              // Masalan: 24-maktabga borish
    val location: String = "",           // Masalan: Navoiy ko'chasi, 24-maktab
    val notes: String? = null,           // Qo'shimcha eslatma
    val scheduledTime: Long = 0L,        // Rejalashtirilgan sana va soat
    val isNotified: Boolean = false,
    val isCompleted: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
) {
    val notificationTime: Long
        get() = scheduledTime - (30 * 60 * 1000L)
}
