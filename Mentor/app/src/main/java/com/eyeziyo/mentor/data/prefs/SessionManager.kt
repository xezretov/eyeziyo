package com.eyeziyo.mentor.data.prefs

import android.content.Context
import androidx.core.content.edit
import com.eyeziyo.mentor.data.net.MentorUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Single source of truth for auth state and the cached MentorUser profile.
 * Replaces the old `ServerConfig` object — same surface, encrypted storage,
 * exposes a Flow so the shell can react to login/logout without manual wiring.
 */
object SessionManager {
    private const val K_ACCESS = "access_token"
    private const val K_REFRESH = "refresh_token"
    private const val K_EXPIRES_AT = "token_expires_at"
    private const val K_USER_ID = "user_id"
    private const val K_USER_EMAIL = "user_email"
    private const val K_USER_NAME = "user_name"
    private const val K_USER_AVATAR = "user_avatar"
    private const val K_USER_ROLE = "user_role"
    private const val K_USER_GROUPS = "user_groups"
    private const val K_USER_COURSE = "user_course"
    private const val K_BIOMETRIC_ENABLED = "biometric_enabled"
    private const val K_LAST_EMAIL = "last_email"

    private lateinit var appContext: Context

    private val _user = MutableStateFlow<MentorUser?>(null)
    val user: StateFlow<MentorUser?> = _user.asStateFlow()

    private val _signedIn = MutableStateFlow(false)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    fun init(context: Context) {
        appContext = context.applicationContext
        _user.value = loadUser()
        _signedIn.value = accessToken() != null
    }

    private fun prefs() = SecurePrefs.get(appContext)

    fun accessToken(): String? = prefs().getString(K_ACCESS, null)
    fun refreshToken(): String? = prefs().getString(K_REFRESH, null)
    fun expiresAt(): Long = prefs().getLong(K_EXPIRES_AT, 0L)

    fun setTokens(access: String, refresh: String? = null, expiresInSec: Int? = null) {
        prefs().edit {
            putString(K_ACCESS, access)
            if (!refresh.isNullOrBlank()) putString(K_REFRESH, refresh)
            if (expiresInSec != null) putLong(K_EXPIRES_AT, System.currentTimeMillis() + expiresInSec * 1000L)
        }
        _signedIn.value = true
    }

    fun setUser(user: MentorUser?) {
        prefs().edit {
            if (user == null) {
                remove(K_USER_ID); remove(K_USER_EMAIL); remove(K_USER_NAME); remove(K_USER_AVATAR)
                remove(K_USER_ROLE); remove(K_USER_GROUPS); remove(K_USER_COURSE)
            } else {
                putInt(K_USER_ID, user.id)
                putString(K_USER_EMAIL, user.email)
                putString(K_USER_NAME, user.name)
                putString(K_USER_AVATAR, user.avatar)
                putString(K_USER_ROLE, user.role)
                putString(K_USER_GROUPS, user.groups.joinToString("|"))
                putString(K_USER_COURSE, user.course_type)
                putString(K_LAST_EMAIL, user.email)
            }
        }
        _user.value = user
    }

    fun lastEmail(): String? = prefs().getString(K_LAST_EMAIL, null)

    fun isBiometricEnabled(): Boolean = prefs().getBoolean(K_BIOMETRIC_ENABLED, false)
    fun setBiometricEnabled(value: Boolean) {
        prefs().edit { putBoolean(K_BIOMETRIC_ENABLED, value) }
    }

    private fun loadUser(): MentorUser? {
        val p = prefs()
        val id = p.getInt(K_USER_ID, -1)
        if (id < 0) return null
        val email = p.getString(K_USER_EMAIL, "") ?: ""
        val name = p.getString(K_USER_NAME, "") ?: ""
        return MentorUser(
            id = id,
            email = email,
            name = name,
            role = p.getString(K_USER_ROLE, "student") ?: "student",
            avatar = (p.getString(K_USER_AVATAR, null) ?: name.take(1).ifBlank { "M" }),
            groups = (p.getString(K_USER_GROUPS, "") ?: "").split("|").filter { it.isNotBlank() },
            course_type = p.getString(K_USER_COURSE, "") ?: "",
        )
    }

    fun clear() {
        prefs().edit {
            remove(K_ACCESS); remove(K_REFRESH); remove(K_EXPIRES_AT)
            remove(K_USER_ID); remove(K_USER_EMAIL); remove(K_USER_NAME); remove(K_USER_AVATAR)
            remove(K_USER_ROLE); remove(K_USER_GROUPS); remove(K_USER_COURSE)
            // keep last_email + biometric flag so re-login is friendlier
        }
        _user.value = null
        _signedIn.value = false
    }
}
