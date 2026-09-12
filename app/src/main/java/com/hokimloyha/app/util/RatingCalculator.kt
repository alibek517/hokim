package com.hokimloyha.app.util

import com.hokimloyha.app.model.TaskItem
import com.hokimloyha.app.model.TaskStatus
import com.hokimloyha.app.model.User
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class WorkerStats(
    val workerId: String,
    val score: Double,                 // 0.0 dan 10.0 gacha
    val totalTasks: Int,
    val completedTasks: Int,
    val earlyCompletedTasks: Int,      // Vaqtidan oldin tugatilganlar (ball ko'taradi)
    val lateCompletedTasks: Int,       // Muddatidan kechikib tugatilganlar (ball tushiradi)
    val overduePendingTasks: Int,      // Muddati o'tib ketgan va hali bajarilmaganlar
    val inProgressTasks: Int,
    val daysInactive: Long,            // Ilovaga kirmagan kunlar soni
    val inactivityPenalty: Double,     // Kirmaganlik uchun jarima balli
    val rank: Int = 0,                 // 1-o'rin, 2-o'rin...
    val gradeText: String,             // Daraja nomi
    val earlyStartTasks: Int = 0       // Vaqtidan oldin boshlangan ishlar
)

object RatingCalculator {

    /**
     * Xodim statistikasini hisoblash (10 ballik tizim):
     * 1. 0 ta ish biriktirilgan bo'lsa -> bali 0.0 bo'lib turadi.
     * 2. Bajarilishi kerak bo'lgan vaqtdan oldin boshlab, oldinroq tugatganlarga ko'proq ball beriladi (9.0 - 10.0).
     * 3. Kechikib boshlasa va kech tugatsa reytingi tushib ketadi.
     * 4. Ilovaga kirmay qo'ysa ham reytingi tushadi (har bir kirmagan kun uchun -0.5 ball).
     * 5. Kunda kirgani uchun reyting ko'tarilmaydi (faqat kirmagani uchun tushadi).
     * 6. Reyting ko'tarilishi faqat topshiriqni erta boshlab, erta tugatgan hisobiga bo'ladi.
     */
    fun calculateWorkerStats(
        worker: User,
        allTasks: List<TaskItem>,
        currentTime: Long = System.currentTimeMillis()
    ): WorkerStats {
        val workerTasks = allTasks.filter { it.assignedWorkerId == worker.id }

        // 1. Agar 0 ta ish biriktirilgan bo'lsa -> 0.0 ball
        if (workerTasks.isEmpty()) {
            return WorkerStats(
                workerId = worker.id,
                score = 0.0,
                totalTasks = 0,
                completedTasks = 0,
                earlyCompletedTasks = 0,
                lateCompletedTasks = 0,
                overduePendingTasks = 0,
                inProgressTasks = 0,
                daysInactive = 0,
                inactivityPenalty = 0.0,
                gradeText = "Topshiriqsiz (0 ta ish)",
                earlyStartTasks = 0
            )
        }

        var completedCount = 0
        var earlyCompletedCount = 0
        var lateCompletedCount = 0
        var overduePendingCount = 0
        var inProgressCount = 0
        var earlyStartCount = 0

        var sumTaskScores = 0.0

        for (task in workerTasks) {
            val isCompleted = task.status == TaskStatus.COMPLETED_GREEN || task.status == TaskStatus.INSPECTED_BLUE

            if (isCompleted) {
                completedCount++
                val finishTime = task.completedAt ?: task.inspectedAt ?: task.endDate
                val allocatedDuration = max(3600000L, task.endDate - task.startDate) // kamida 1 soat

                // Erta boshlanganmi?
                val startedEarly = task.startedAt != null && task.startedAt <= task.startDate
                if (startedEarly) earlyStartCount++

                // Muddatdan oldin tugatilganmi?
                if (finishTime <= task.endDate) {
                    earlyCompletedCount++
                    // Necha foiz oldinroq tugatdi:
                    val earlyRatio = min(1.0, max(0.0, (task.endDate - finishTime).toDouble() / allocatedDuration))
                    
                    // Asosiy ball 8.5, oldinroq tugatgani uchun +1.0 gacha, oldinroq boshlagani uchun +0.5
                    // Jami 10.0 gacha yetadi!
                    val bonus = (earlyRatio * 1.0) + (if (startedEarly) 0.5 else 0.0)
                    val tScore = min(10.0, 8.5 + bonus)
                    sumTaskScores += tScore
                } else {
                    // Kech tugatilgan!
                    lateCompletedCount++
                    val overdueHours = (finishTime - task.endDate).toDouble() / 3600000.0
                    // Kechikish soatiga qarab ball 5.0 dan 1.5 gacha tushadi
                    val tScore = max(1.5, 5.0 - min(3.5, overdueHours * 0.25))
                    sumTaskScores += tScore
                }
            } else {
                // Hali yakunlanmagan
                if (task.status == TaskStatus.IN_PROGRESS_YELLOW) {
                    inProgressCount++
                }

                val startedEarly = task.startedAt != null && task.startedAt <= task.startDate
                if (startedEarly) earlyStartCount++

                if (currentTime > task.endDate) {
                    // Muddati o'tgan va hali bajarilmagan -> Reyting tushib ketadi!
                    overduePendingCount++
                    val overdueDays = (currentTime - task.endDate).toDouble() / 86400000.0
                    val tScore = max(0.5, 3.0 - min(2.5, overdueDays * 0.5))
                    sumTaskScores += tScore
                } else {
                    // Muddat ichida
                    if (task.startedAt != null && task.startedAt <= task.startDate) {
                        sumTaskScores += 8.0 // o'z vaqtida boshlab bajarmoqda
                    } else if (currentTime > task.startDate && task.status == TaskStatus.PENDING_RED) {
                        sumTaskScores += 4.5 // boshlanish vaqti o'tib ketgan, lekin hali boshlamagan
                    } else {
                        sumTaskScores += 7.0 // yangi topshiriq
                    }
                }
            }
        }

        val rawAverageScore = sumTaskScores / workerTasks.size

        // 2. Ilovaga kirmaganlik uchun jazo (-0.5 ball har bir to'liq kirmagan kunga)
        val lastActive = worker.lastActiveAt ?: worker.createdAt
        val daysInactive = max(0L, (currentTime - lastActive) / 86400000L)

        val inactivityPenalty = if (daysInactive >= 1) {
            min(4.0, daysInactive * 0.5)
        } else {
            0.0
        }

        // Yakuniy ball (0.5 dan 10.0 oralig'ida)
        val finalCalc = max(0.5, min(10.0, rawAverageScore - inactivityPenalty))
        val roundedScore = (finalCalc * 10.0).roundToInt() / 10.0

        val grade = when {
            roundedScore >= 9.0 -> "O'ta tezkor (A+)"
            roundedScore >= 8.0 -> "A'lo (A)"
            roundedScore >= 6.5 -> "Yaxshi (B)"
            roundedScore >= 5.0 -> "O'rtacha (C)"
            else -> "Qoniqarsiz (D)"
        }

        return WorkerStats(
            workerId = worker.id,
            score = roundedScore,
            totalTasks = workerTasks.size,
            completedTasks = completedCount,
            earlyCompletedTasks = earlyCompletedCount,
            lateCompletedTasks = lateCompletedCount,
            overduePendingTasks = overduePendingCount,
            inProgressTasks = inProgressCount,
            daysInactive = daysInactive,
            inactivityPenalty = inactivityPenalty,
            gradeText = grade,
            earlyStartTasks = earlyStartCount
        )
    }

    /**
     * Barcha xodimlarning reytingini hisoblab, eng yuqori balldan pastga qarab tartiblaydi
     */
    fun calculateAllWorkerStats(
        workers: List<User>,
        allTasks: List<TaskItem>,
        currentTime: Long = System.currentTimeMillis()
    ): List<Pair<User, WorkerStats>> {
        val list = workers.map { w ->
            w to calculateWorkerStats(w, allTasks, currentTime)
        }

        val sorted = list.sortedWith(
            compareByDescending<Pair<User, WorkerStats>> { it.second.score }
                .thenByDescending { it.second.earlyCompletedTasks }
                .thenBy { it.second.lateCompletedTasks }
                .thenBy { it.first.fullName }
        )

        return sorted.mapIndexed { index, (user, stats) ->
            user to stats.copy(rank = index + 1)
        }
    }
}
