package com.hokimloyha.app.service

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import java.io.IOException

class VoiceRecorder(private val context: Context) {

    private var recorder: MediaRecorder? = null
    private var currentFilePath: String? = null
    private var startTimeMillis: Long = 0

    fun startRecording(): String? {
        val audioDir = File(context.filesDir, "voice_messages")
        if (!audioDir.exists()) audioDir.mkdirs()

        val audioFile = File(audioDir, "voice_${System.currentTimeMillis()}.m4a")
        currentFilePath = audioFile.absolutePath

        recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(128000)
            setAudioSamplingRate(44100)
            setOutputFile(currentFilePath)
            try {
                prepare()
                start()
                startTimeMillis = System.currentTimeMillis()
            } catch (e: IOException) {
                e.printStackTrace()
                return null
            }
        }

        return currentFilePath
    }

    fun stopRecording(): Pair<String, Int>? {
        return try {
            recorder?.apply {
                stop()
                release()
            }
            recorder = null
            val durationSec = ((System.currentTimeMillis() - startTimeMillis) / 1000).toInt().coerceAtLeast(1)
            val path = currentFilePath
            currentFilePath = null
            if (path != null) Pair(path, durationSec) else null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun cancelRecording() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            // e'tiborsiz qoldirish
        }
        recorder = null
        currentFilePath?.let { File(it).delete() }
        currentFilePath = null
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
