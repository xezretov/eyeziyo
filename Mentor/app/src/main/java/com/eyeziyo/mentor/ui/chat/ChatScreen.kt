package com.eyeziyo.mentor.ui.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicNone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.data.net.ChatMessage
import com.eyeziyo.mentor.data.prefs.AppLanguage
import com.eyeziyo.mentor.data.prefs.SettingsStore
import com.eyeziyo.mentor.domain.DateUtil
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.ChatViewModel
import com.eyeziyo.mentor.util.MarkdownText
import com.eyeziyo.mentor.util.VoiceInput
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(lessonId: Int, onBack: () -> Unit) {
    val vm: ChatViewModel = viewModel(
        key = "chat-$lessonId",
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return ChatViewModel(lessonId) as T
            }
        },
    )
    val messages by vm.messages.collectAsState()
    val sending by vm.sending.collectAsState()
    val loading by vm.loading.collectAsState()
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val c = colors()

    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var voiceListening by remember { mutableStateOf(false) }
    val voice = remember { VoiceInput(context) }

    DisposableEffect(Unit) {
        onDispose { voice.stop() }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            scope.launch { listState.animateScrollToItem(messages.size - 1) }
        }
    }

    val showScrollToBottom by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            messages.isNotEmpty() && last < messages.size - 2
        }
    }

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.chat_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading && messages.isEmpty() -> CenteredLoader()
                    messages.isEmpty() -> EmptyChat(
                        onPickQuick = { draft = it },
                    )
                    else -> {
                        LazyColumn(
                            state = listState,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(count = messages.size) { i ->
                                ChatBubble(messages[i], context)
                            }
                            if (sending) item { TypingBubble() }
                        }
                        if (showScrollToBottom) {
                            FloatingActionButton(
                                onClick = { scope.launch { listState.animateScrollToItem(messages.size - 1) } },
                                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).size(40.dp),
                                containerColor = c.primary,
                                contentColor = Color.White,
                            ) { Icon(Icons.Default.KeyboardArrowDown, contentDescription = null) }
                        }
                    }
                }
            }

            // Quick actions row above input
            if (messages.isEmpty() || messages.size <= 2) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    QuickPill(stringResource(R.string.chat_quick_explain)) { draft = it }
                    QuickPill(stringResource(R.string.chat_quick_example)) { draft = it }
                    QuickPill(stringResource(R.string.chat_quick_quiz)) { draft = it }
                }
            }

            Surface(shadowElevation = 4.dp, color = c.bgSurface) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (voice.isAvailable()) {
                        IconButton(
                            onClick = {
                                if (!voice.hasPermission() && activity != null) {
                                    voice.requestPermission(activity)
                                    return@IconButton
                                }
                                voiceListening = true
                                val tag = when (SettingsStore.language.value) {
                                    AppLanguage.Ru -> "ru-RU"
                                    AppLanguage.En -> "en-US"
                                    else -> "uz-UZ"
                                }
                                voice.listen(
                                    languageTag = tag,
                                    onPartial = { draft = it },
                                    onFinal = { text ->
                                        draft = text
                                        voiceListening = false
                                    },
                                    onError = {
                                        voiceListening = false
                                        Toast.makeText(context, R.string.chat_voice_unavailable, Toast.LENGTH_SHORT).show()
                                    },
                                )
                            },
                        ) {
                            Icon(
                                if (voiceListening) Icons.Default.Mic else Icons.Default.MicNone,
                                contentDescription = stringResource(R.string.chat_voice),
                                tint = if (voiceListening) c.danger else c.textSecondary,
                            )
                        }
                    }
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        placeholder = {
                            Text(if (voiceListening) stringResource(R.string.chat_voice_listening) else stringResource(R.string.chat_input_placeholder))
                        },
                        maxLines = 4,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = {
                            val text = draft.trim()
                            if (text.isBlank() || sending) return@IconButton
                            vm.send(text)
                            draft = ""
                        },
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(c.primary),
                    ) {
                        if (sending) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                        else Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.chat_send), tint = Color.White)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatBubble(msg: ChatMessage, context: Context) {
    val c = colors()
    val isUser = msg.role == "user"
    var showTimestamp by remember { mutableStateOf(false) }
    val ts = DateUtil.parseIsoOrNull(msg.created_at)

    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
            Surface(
                color = if (isUser) c.userBubble else c.aiBubble,
                shape = RoundedCornerShape(
                    topStart = 16.dp, topEnd = 16.dp,
                    bottomStart = if (isUser) 16.dp else 4.dp,
                    bottomEnd = if (isUser) 4.dp else 16.dp,
                ),
                modifier = Modifier
                    .widthIn(max = 320.dp)
                    .combinedClickable(
                        onClick = { showTimestamp = !showTimestamp },
                        onLongClick = {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                            cm?.setPrimaryClip(ClipData.newPlainText("mentor", msg.content))
                            Toast.makeText(context, R.string.chat_copied, Toast.LENGTH_SHORT).show()
                        },
                    ),
            ) {
                if (isUser) {
                    Text(
                        msg.content,
                        color = c.onUserBubble,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    )
                } else {
                    Box(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                        MarkdownText(text = msg.content, contentColor = c.onAiBubble)
                    }
                }
            }
            if (showTimestamp && ts != null) {
                Text(
                    DateUtil.formatTime(ts),
                    style = MaterialTheme.typography.labelSmall,
                    color = c.textMuted,
                    modifier = Modifier.padding(top = 2.dp, start = 4.dp, end = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun TypingBubble() {
    val c = colors()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Surface(color = c.aiBubble, shape = RoundedCornerShape(16.dp)) {
            Row(
                Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                repeat(3) {
                    Box(Modifier.size(7.dp).clip(RoundedCornerShape(50)).background(c.textMuted))
                }
            }
        }
    }
}

@Composable
private fun EmptyChat(onPickQuick: (String) -> Unit) {
    val c = colors()
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = c.primary, modifier = Modifier.size(56.dp))
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.chat_empty_title), style = MaterialTheme.typography.headlineSmall, color = c.textPrimary)
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.chat_empty_sub),
            style = MaterialTheme.typography.bodyMedium,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun QuickPill(text: String, onPick: (String) -> Unit) {
    val c = colors()
    Surface(
        color = c.primaryLight,
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.combinedClickable(onClick = { onPick(text) }, onLongClick = {}),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = c.primary,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

