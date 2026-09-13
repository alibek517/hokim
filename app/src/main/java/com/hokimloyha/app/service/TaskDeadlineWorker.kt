package com.hokimloyha.app.service

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.hokimloyha.app.HokimApp
import com.hokimloyha.app.data.AppStorage
import com.hokimloyha.app.model.TaskStatus
import java.util.concurrent.TimeUnit

class TaskDeadlineWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val app = context.applicationContext as? HokimApp
        val storage = app?.storage ?: return Result.success()

        checkDeadlines(context, storage)
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "task_deadline_monitor_work"

        fun scheduleMonitoring(context: Context) {
            val workRequest = PeriodicWorkRequestBuilder<TaskDeadlineWorker>(15, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        }

        fun checkDeadlines(context: Context, storage: AppStorage) {
            val now = System.currentTimeMillis()
            val tasks = storage.tasks.value
            val notificationHelper = NotificationHelper(context)

            tasks.forEach { task ->
                // 1. Belgilangan boshlanish vaqti keldi, lekin ish hali boshlanmagan (PENDING_RED)
                if (now >= task.startDate && task.status == TaskStatus.PENDING_RED && !task.startAlertSent) {
                    notificationHelper.showTaskAlert(
                        id = task.id.hashCode() + 1,
                        title = "Topshiriq hali boshlanmadi!",
                        message = "Siz belgilagan boshlanish muddati yetib keldi, ammo xodim (${task.assignedWorkerName}) ushbu ishni hali boshlamadi!\nManzil: ${task.address}\nVazifa: ${task.title}",
                        isUrgent = true
                    )
                    storage.markTaskStartAlertSent(task.id)
                }

                // 2. Belgilangan tugash muddati yetib keldi, lekin ish hali yakunlanmagan
                if (now >= task.endDate && task.status != TaskStatus.COMPLETED_GREEN && task.status != TaskStatus.INSPECTED_BLUE && !task.deadlineAlertSent) {
                    val alertMessage = if (task.status == TaskStatus.PENDING_RED) {
                        "Topshiriq muddati tugadi, lekin xodim (${task.assignedWorkerName}) ishni hatto boshlamagan ham!\nManzil: ${task.address}"
                    } else {
                        "Topshiriq muddati tugadi, lekin ish hali to'liq yakunlanmagan (jarayonda qolib ketgan)!\nManzil: ${task.address}"
                    }

                    notificationHelper.showTaskAlert(
                        id = task.id.hashCode() + 2,
                        title = "Topshiriq muddati buzildi!",
                        message = alertMessage,
                        isUrgent = true
                    )
                    storage.markTaskDeadlineAlertSent(task.id)
                }
            }
        }
    }
}
