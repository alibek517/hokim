package com.hokimloyha.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hokimloyha.app.model.TaskStatus
import com.hokimloyha.app.ui.theme.StatusBlue
import com.hokimloyha.app.ui.theme.StatusBlueBg
import com.hokimloyha.app.ui.theme.StatusGreen
import com.hokimloyha.app.ui.theme.StatusGreenBg
import com.hokimloyha.app.ui.theme.StatusRed
import com.hokimloyha.app.ui.theme.StatusRedBg
import com.hokimloyha.app.ui.theme.StatusYellow
import com.hokimloyha.app.ui.theme.StatusYellowBg

@Composable
fun TaskStatusBadge(status: TaskStatus, modifier: Modifier = Modifier) {
    val (bgColor, textColor, dotColor, label) = when (status) {
        TaskStatus.PENDING_RED -> Quad(StatusRedBg, StatusRed, StatusRed, "Boshlanmagan")
        TaskStatus.IN_PROGRESS_YELLOW -> Quad(StatusYellowBg, StatusYellow, StatusYellow, "Jarayonda")
        TaskStatus.COMPLETED_GREEN -> Quad(StatusGreenBg, StatusGreen, StatusGreen, "Bajarildi")
        TaskStatus.INSPECTED_BLUE -> Quad(StatusBlueBg, StatusBlue, StatusBlue, "Tekshirildi")
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(dotColor)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                color = textColor,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
