package com.hokimloyha.app.service

object AppStateTracker {
    @Volatile
    var isAppInForeground: Boolean = false

    @Volatile
    var activeChatPeerUserId: String? = null
}
