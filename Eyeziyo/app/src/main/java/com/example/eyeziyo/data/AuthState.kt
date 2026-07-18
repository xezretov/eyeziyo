package com.example.eyeziyo.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/**
 * User model for UI
 */
data class User(
    val id: Int,
    val email: String,
    val name: String,
    val role: String,  // "teacher" or "admin"
    val avatar: String,
    val groups: List<String> = emptyList(),
    val courseType: String = ""
) {
    companion object {
        fun fromApiUser(apiUser: ApiUser): User {
            return User(
                id = apiUser.id,
                email = apiUser.email,
                name = apiUser.name,
                role = apiUser.role,
                avatar = apiUser.avatar,
                groups = apiUser.groups,
                courseType = apiUser.course_type
            )
        }
    }
}

/**
 * Authentication state holder
 */
sealed class AuthUiState {
    data object Idle : AuthUiState()
    data object Loading : AuthUiState()
    data class LoggedIn(val user: User) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

/**
 * ViewModel for authentication
 */
class AuthViewModel : ViewModel() {

    private var apiService: ApiService? = null

    var uiState by mutableStateOf<AuthUiState>(AuthUiState.Idle)
        private set

    var user by mutableStateOf<User?>(null)
        private set

    var loginError by mutableStateOf<String?>(null)
        private set

    val isAuthenticated: Boolean
        get() = user != null

    /**
     * Initialize with context to get ApiService
     */
    fun initialize(context: Context) {
        apiService = ApiService.getInstance(context)

        // Check if already logged in
        val cachedUser = apiService?.cachedUser
        if (cachedUser != null && apiService?.isLoggedIn == true) {
            user = User.fromApiUser(cachedUser)
            uiState = AuthUiState.LoggedIn(user!!)
        }
    }

    /**
     * Login with email and password
     */
    fun login(email: String, password: String): Result<User> {
        loginError = null

        // Validate input
        if (email.isBlank()) {
            loginError = "Email kiritilmagan"
            return Result.failure(Exception(loginError!!))
        }
        if (password.isBlank()) {
            loginError = "Parol kiritilmagan"
            return Result.failure(Exception(loginError!!))
        }
        if (password.length < 6) {
            loginError = "Parol kamida 6 ta belgidan iborat bo'lishi kerak"
            return Result.failure(Exception(loginError!!))
        }

        // Return a result that indicates async operation needed
        // Actual login is done via loginAsync
        return Result.failure(Exception("USE_ASYNC_LOGIN"))
    }

    /**
     * Async login with API
     */
    fun loginAsync(email: String, password: String, onResult: (Result<User>) -> Unit) {
        val service = apiService ?: run {
            onResult(Result.failure(Exception("ApiService not initialized")))
            return
        }

        uiState = AuthUiState.Loading
        loginError = null

        viewModelScope.launch {
            when (val result = service.login(email, password)) {
                is ApiResult.Success -> {
                    val newUser = User.fromApiUser(result.data)
                    user = newUser
                    uiState = AuthUiState.LoggedIn(newUser)
                    onResult(Result.success(newUser))
                }
                is ApiResult.Error -> {
                    loginError = result.message
                    uiState = AuthUiState.Error(result.message)
                    onResult(Result.failure(Exception(result.message)))
                }
            }
        }
    }

    /**
     * Register new user
     */
    fun register(
        email: String,
        password: String,
        name: String,
        role: String = "teacher",
        groups: List<String> = emptyList(),
        courseType: String = "",
        onResult: (Result<User>) -> Unit
    ) {
        val service = apiService ?: run {
            onResult(Result.failure(Exception("ApiService not initialized")))
            return
        }

        uiState = AuthUiState.Loading
        loginError = null

        viewModelScope.launch {
            when (val result = service.register(email, password, name, role, groups, courseType)) {
                is ApiResult.Success -> {
                    // Auto-login after registration
                    loginAsync(email, password, onResult)
                }
                is ApiResult.Error -> {
                    loginError = result.message
                    uiState = AuthUiState.Error(result.message)
                    onResult(Result.failure(Exception(result.message)))
                }
            }
        }
    }

    /**
     * Refresh user profile from server
     */
    fun refreshProfile(onResult: (Result<User>) -> Unit = {}) {
        val service = apiService ?: return

        viewModelScope.launch {
            when (val result = service.getCurrentUser()) {
                is ApiResult.Success -> {
                    val newUser = User.fromApiUser(result.data)
                    user = newUser
                    uiState = AuthUiState.LoggedIn(newUser)
                    onResult(Result.success(newUser))
                }
                is ApiResult.Error -> {
                    onResult(Result.failure(Exception(result.message)))
                }
            }
        }
    }

    /**
     * Logout user
     */
    fun logout() {
        apiService?.logout()
        user = null
        loginError = null
        uiState = AuthUiState.Idle
    }

    /**
     * Clear error state
     */
    fun clearError() {
        loginError = null
        if (uiState is AuthUiState.Error) {
            uiState = AuthUiState.Idle
        }
    }
}
