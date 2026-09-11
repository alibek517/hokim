package com.hokimloyha.app

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.service.AppStateTracker
import com.hokimloyha.app.service.NotificationHelper
import com.hokimloyha.app.service.TaskDeadlineWorker
import com.hokimloyha.app.service.VoicePlayer

class HokimApp : Application() {

    lateinit var storage: AppStorage
        private set

    lateinit var notificationHelper: NotificationHelper
        private set

    val voicePlayer = VoicePlayer()

    override fun onCreate() {
        super.onCreate()
        storage = AppStorage(this)
        notificationHelper = NotificationHelper(this)

        // Ilova ekranda turganligini kuzatish
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            private var activityCount = 0

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {
                if (++activityCount == 1) {
                    AppStateTracker.isAppInForeground = true
                }
            }
            override fun onActivityResumed(activity: Activity) {
                AppStateTracker.isAppInForeground = true
            }
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {
                if (--activityCount <= 0) {
                    activityCount = 0
                    AppStateTracker.isAppInForeground = false
                    AppStateTracker.activeChatPeerUserId = null
                }
            }
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })

        // Muddatlarni orqa fonda monitoring qilishni faollashtirish
        TaskDeadlineWorker.scheduleMonitoring(this)
    }
}
