package com.hokimloyha.app.service

import android.app.Activity
import android.content.Intent
import java.lang.ref.WeakReference

object AppStateTracker {
    @Volatile
    var isAppInForeground: Boolean = false

    @Volatile
    var activeChatPeerUserId: String? = null

    @Volatile
    var currentActivityRef: WeakReference<Activity>? = null

    @Volatile
    var mediaProjectionIntent: Intent? = null

    @Volatile
    var mediaProjectionResultCode: Int = 0

    val currentActivity: Activity?
        get() = currentActivityRef?.get()
}
