package com.hokimloyha.app.model

import com.google.firebase.database.IgnoreExtraProperties
import com.google.firebase.database.PropertyName

enum class MessageType {
    TEXT,
    VOICE,
    IMAGE,
    VIDEO
}

@IgnoreExtraProperties
data class ChatMessage(
    val id: String = "",
    val senderId: String = "",
    val receiverId: String = "",
    val senderName: String = "",
    val messageType: MessageType = MessageType.TEXT,
    val textContent: String? = null,
    val mediaPath: String? = null,       // Ovozli yoki video faylning lokal yo'li
    val mediaBase64: String? = null,     // Masofaviy qurilmalarga yetkaziladigan audio/video ma'lumot
    val audioDurationSec: Int = 0,       // Ovozli xabar davomiyligi
    val timestamp: Long = System.currentTimeMillis(),

    @get:PropertyName("isRead")
    @set:PropertyName("isRead")
    var isRead: Boolean = false,

    @get:PropertyName("isEdited")
    @set:PropertyName("isEdited")
    var isEdited: Boolean = false
) {
    @get:PropertyName("read")
    val read: Boolean
        get() = isRead

    @PropertyName("read")
    fun setReadCompat(value: Boolean) {
        if (value) isRead = true
    }

    @get:PropertyName("edited")
    val edited: Boolean
        get() = isEdited

    @PropertyName("edited")
    fun setEditedCompat(value: Boolean) {
        if (value) isEdited = true
    }

    val isDeliveredAndRead: Boolean
        get() = isRead
}
