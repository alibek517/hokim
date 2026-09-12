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
    val earlyCompletedTasks: Int,      // Vaqtidan oldin tugatilganlar
    val lateCompletedTasks: Int,       // Muddatidan kechikib tugatilganlar
    val overduePendingTasks: Int,      // Muddati o'tib ketgan va hali bajarilmaganlar
    val inProgressTasks: Int,
    val daysInactive: Long,            // Ilovaga kirmagan kunlar soni
    val inactivityPenalty: Double,     // Kirmaganlik uchun jarima balli
    val rank: Int = 0,                 // 1-o'rin, 2-o'rin...
    val gradeText: String,             // Daraja nomi
    val earlyStartTasks: Int = 0,      // Vaqtidan oldin boshlangan ishlar
    val inspectedTasks: Int = 0        // Hokim tekshirgan topshiriqlar soni (+0.5 bal har biri)
)

object RatingCalculator {

    /**
     * Xodim statistikasini hisoblash (10 ballik tizim):
     * 1. 0 ta ish biriktirilgan bo'lsa -> bali 0.0 bo'lib turadi.
     * 2. Ishni boshlaganda (IN_PROGRESS_YELLOW) yoki tugatganda (COMPLETED_GREEN) ortiqcha ball berilmaydi.
     * 3. Faqat Hokim borib tekshirib tasdiqlagan (INSPECTED_BLUE) topshiriq uchun har biriga +0.5 ball beriladi.
     * 4. Ilovaga kirmay qo'ysa reyting tushadi (har bir kirmagan kun uchun -0.5 ball).
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
                gradeText = "Topshiriqsiz (0 ta)",
                earlyStartTasks = 0,
                inspectedTasks = 0
            )
        }

        var completedCount = 0
        var inspectedCount = 0
        var earlyCompletedCount = 0
        var lateCompletedCount = 0
        var overduePendingCount = 0
        var inProgressCount = 0
        var earlyStartCount = 0

        for (task in workerTasks) {
            val isInspected = task.status == TaskStatus.INSPECTED_BLUE
            val isCompleted = task.status == TaskStatus.COMPLETED_GREEN || isInspected

            if (isInspected) {
                inspectedCount++
            }

            val startedEarly = task.startedAt != null && task.startedAt <= task.startDate
            if (startedEarly) earlyStartCount++

            if (isCompleted) {
                completedCount++
                val finishTime = task.completedAt ?: task.inspectedAt ?: task.endDate
                if (finishTime <= task.endDate) {
                    earlyCompletedCount++
                } else {
                    lateCompletedCount++
                }
            } else {
                if (task.status == TaskStatus.IN_PROGRESS_YELLOW) {
                    inProgressCount++
                }
                if (currentTime > task.endDate) {
                    overduePendingCount++
                }
            }
        }

        // 2. Ball hisoblash: Har bir hokim tekshirgan topshiriq uchun +0.5 ball
        // Ishni boshlagan (IN_PROGRESS) yoki shunchaki tugatgan (COMPLETED) payti bal berilmaydi
        val baseScore = inspectedCount * 0.5

        // 3. Ilovaga kirmaganlik uchun jazo (-0.5 ball har bir to'liq kirmagan kunga)
        val lastActive = worker.lastActiveAt ?: worker.createdAt
        val daysInactive = max(0L, (currentTime - lastActive) / 86400000L)

        val inactivityPenalty = if (daysInactive >= 1) {
            min(4.0, daysInactive * 0.5)
        } else {
            0.0
        }

        // Yakuniy ball (0.0 dan 10.0 oralig'ida)
        val finalCalc = max(0.0, min(10.0, baseScore - inactivityPenalty))
        val roundedScore = (finalCalc * 10.0).roundToInt() / 10.0

        val grade = when {
            roundedScore >= 9.0 -> "O'ta faol (A+)"
            roundedScore >= 7.5 -> "A'lo (A)"
            roundedScore >= 5.0 -> "Yaxshi (B)"
            roundedScore >= 2.5 -> "O'rtacha (C)"
            roundedScore >= 0.5 -> "Boshlang'ich (D)"
            else -> if (workerTasks.isEmpty()) "Topshiriqsiz (0 ta)" else "Ball to'planmagan (0)"
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
            earlyStartTasks = earlyStartCount,
            inspectedTasks = inspectedCount
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
                .thenByDescending { it.second.inspectedTasks }
                .thenByDescending { it.second.earlyCompletedTasks }
                .thenBy { it.second.lateCompletedTasks }
                .thenBy { it.first.fullName }
        )

        return sorted.mapIndexed { index, (user, stats) ->
            user to stats.copy(rank = index + 1)
        }
    }
}
