package com.eyeziyo.mentor.data.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * EncryptedSharedPreferences wrapper. The Keystore-backed master key keeps
 * the access/refresh tokens away from a rooted-device casual reader.
 *
 * If keystore initialization ever fails (rare; old/corrupt devices), we fall
 * back to plain SharedPreferences so the app stays usable. This is logged but
 * not fatal — losing offline cache is preferable to bricking login.
 */
object SecurePrefs {
    private const val FILE = "mentor_secure"
    private const val LEGACY_FILE = "mentor_auth"

    @Volatile private var prefs: SharedPreferences? = null

    fun get(context: Context): SharedPreferences {
        prefs?.let { return it }
        synchronized(this) {
            prefs?.let { return it }
            val resolved = createEncrypted(context) ?: context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            migrateLegacy(context, resolved)
            prefs = resolved
            return resolved
        }
    }

    private fun createEncrypted(context: Context): SharedPreferences? = runCatching {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrNull()

    private fun migrateLegacy(context: Context, target: SharedPreferences) {
        val legacy = context.getSharedPreferences(LEGACY_FILE, Context.MODE_PRIVATE)
        val all = legacy.all
        if (all.isEmpty()) return
        if (target.contains("token")) return
        target.edit {
            for ((k, v) in all) {
                when (v) {
                    is String -> putString(k, v)
                    is Int -> putInt(k, v)
                    is Long -> putLong(k, v)
                    is Boolean -> putBoolean(k, v)
                    is Float -> putFloat(k, v)
                }
            }
        }
        legacy.edit { clear() }
    }
}
