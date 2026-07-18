package com.example.eyeziyo.util

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File

object AppShare {
    private const val TAG = "AppShare"

    /**
     * Share the currently installed APK with a friendly file name.
     * Android stores installed APKs as base.apk on disk — to avoid that we
     * copy the APK to our cache dir under a nicer name and expose it via
     * FileProvider.
     */
    fun shareInstalledApk(context: Context) {
        try {
            val pm = context.packageManager
            val info = pm.getApplicationInfo(context.packageName, 0)
            val sourceApk = File(info.sourceDir)
            val versionName = pm.getPackageInfo(context.packageName, 0).versionName ?: "1.0"

            val outDir = File(context.cacheDir, "apk").apply { mkdirs() }
            val niceName = "Eyeziyo-${versionName}.apk"
            val outFile = File(outDir, niceName)

            // Always re-copy in case the APK was reinstalled / version bumped.
            sourceApk.copyTo(outFile, overwrite = true)

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                outFile,
            )

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/vnd.android.package-archive"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "Eyeziyo")
                putExtra(Intent.EXTRA_TEXT, "Eyeziyo — AI darslar tahlili")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(
                Intent.createChooser(intent, "Eyeziyo'ni ulashing").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (e: PackageManager.NameNotFoundException) {
            Log.e(TAG, "Package not found", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to share APK", e)
        }
    }
}
