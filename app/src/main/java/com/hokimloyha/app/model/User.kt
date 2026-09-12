package com.hokimloyha.app.model

enum class UserRole {
    BIG_ADMIN,
    MAYOR,
    WORKER
}

data class User(
    val id: String = "",
    val username: String = "",
    val password: String = "",
    val role: UserRole = UserRole.WORKER,
    val firstName: String = "",
    val lastName: String = "",
    val phone: String? = null,
    val position: String? = null,       // Masalan: Yo'l qurilish boshlig'i, Obodonlashtirish xodimi
    val note: String? = null,           // Xodim haqida qo'shimcha ma'lumot
    val regionOrDistrict: String? = null, // Hokim uchun: Tuman/shahar nomi
    val mayorId: String? = null,        // Ishchi qaysi hokimga tegishli ekanligi
    val lastActiveAt: Long? = null,     // Oxirgi marta ilovaga kirgan / faol bo'lgan vaqti
    val createdAt: Long = System.currentTimeMillis()
) {
    val fullName: String get() = "$firstName $lastName".trim()
}
