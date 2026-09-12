package com.hokimloyha.app.service

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

class VoiceRecorder(private val context: Context) {

    private var recorder: MediaRecorder? = null
    private var currentFilePath: String? = null
    private var startTimeMillis: Long = 0

    fun startRecording(): String? {
        // Avvalgi recorder ochiq qolgan bo'lsa xavfsiz tozalaymiz
        cleanupRecorder()

        val audioDir = File(context.filesDir, "voice_messages")
        if (!audioDir.exists()) audioDir.mkdirs()

        val audioFile = File(audioDir, "voice_${System.currentTimeMillis()}.m4a")
        currentFilePath = audioFile.absolutePath

        var started = false

        // 1-urinish: Standard AAC / MPEG_4
        try {
            val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            rec.setAudioSource(MediaRecorder.AudioSource.MIC)
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setOutputFile(currentFilePath)
            rec.prepare()
            rec.start()
            recorder = rec
            startTimeMillis = System.currentTimeMillis()
            started = true
            Log.d("VoiceRecorder", "MPEG4/AAC started successfully: $currentFilePath")
        } catch (e: Throwable) {
            Log.e("VoiceRecorder", "MPEG4/AAC start failed: ${e.message}", e)
            cleanupRecorder()
        }

        // 2-urinish: Context-free fallback MediaRecorder()
        if (!started) {
            try {
                @Suppress("DEPRECATION")
                val rec = MediaRecorder()
                rec.setAudioSource(MediaRecorder.AudioSource.MIC)
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                rec.setOutputFile(currentFilePath)
                rec.prepare()
                rec.start()
                recorder = rec
                startTimeMillis = System.currentTimeMillis()
                started = true
                Log.d("VoiceRecorder", "Fallback MediaRecorder started successfully")
            } catch (e2: Throwable) {
                Log.e("VoiceRecorder", "Fallback AAC start failed: ${e2.message}", e2)
                cleanupRecorder()
            }
        }

        // 3-urinish: Eng universal 3GP / AMR_NB format (har qanday Androidda ishlaydi)
        if (!started) {
            try {
                val fallbackFile = File(audioDir, "voice_${System.currentTimeMillis()}.3gp")
                currentFilePath = fallbackFile.absolutePath
                @Suppress("DEPRECATION")
                val rec = MediaRecorder()
                rec.setAudioSource(MediaRecorder.AudioSource.MIC)
                rec.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                rec.setOutputFile(currentFilePath)
                rec.prepare()
                rec.start()
                recorder = rec
                startTimeMillis = System.currentTimeMillis()
                started = true
                Log.d("VoiceRecorder", "AMR_NB 3GP started successfully")
            } catch (e3: Throwable) {
                Log.e("VoiceRecorder", "All recording attempts failed: ${e3.message}", e3)
                cleanupRecorder()
                currentFilePath = null
                return null
            }
        }

        return currentFilePath
    }

    fun stopRecording(): Pair<String, Int>? {
        val rec = recorder ?: return null
        return try {
            val elapsed = System.currentTimeMillis() - startTimeMillis
            if (elapsed < 1200L) {
                try { Thread.sleep(1200L - elapsed) } catch (_: Throwable) {}
            }
            try {
                rec.stop()
            } catch (e: Throwable) {
                Log.w("VoiceRecorder", "stop() warning: ${e.message}")
            }
            try {
                rec.release()
            } catch (_: Throwable) {}
            recorder = null

            val durationSec = ((System.currentTimeMillis() - startTimeMillis) / 1000).toInt().coerceAtLeast(1)
            val path = currentFilePath
            currentFilePath = null

            if (path != null && File(path).exists() && File(path).length() > 50) {
                Pair(path, durationSec)
            } else {
                Log.w("VoiceRecorder", "Recorded file missing or too small: $path")
                null
            }
        } catch (e: Throwable) {
            Log.e("VoiceRecorder", "stopRecording error", e)
            cleanupRecorder()
            null
        }
    }

    fun cancelRecording() {
        cleanupRecorder()
        currentFilePath?.let {
            try { File(it).delete() } catch (_: Throwable) {}
        }
        currentFilePath = null
    }

    private fun cleanupRecorder() {
        try {
            recorder?.stop()
        } catch (_: Throwable) {}
        try {
            recorder?.reset()
        } catch (_: Throwable) {}
        try {
            recorder?.release()
        } catch (_: Throwable) {}
        recorder = null
    }
}

class VoicePlayer {
    private var mediaPlayer: MediaPlayer? = null
    var currentlyPlayingPath: String? = null
        private set

    fun play(filePath: String, onComplete: () -> Unit) {
        stop()
        try {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(filePath)
                prepare()
                start()
                currentlyPlayingPath = filePath
                setOnCompletionListener {
                    stop()
                    onComplete()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            stop()
            onComplete()
        }
    }

    fun stop() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (e: Exception) {
            // e'tiborsiz
        }
        mediaPlayer = null
        currentlyPlayingPath = null
    }

    fun isPlaying(filePath: String): Boolean {
        return currentlyPlayingPath == filePath && mediaPlayer?.isPlaying == true
    }
}
