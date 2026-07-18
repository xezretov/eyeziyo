package com.eyeziyo.mentor.ui.lessons

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Style
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eyeziyo.mentor.R
import com.eyeziyo.mentor.ui.common.CenteredError
import com.eyeziyo.mentor.ui.common.CenteredLoader
import com.eyeziyo.mentor.ui.common.EmptyState
import com.eyeziyo.mentor.ui.theme.colors
import com.eyeziyo.mentor.ui.vm.TermsViewModel
import com.eyeziyo.mentor.ui.vm.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TermsScreen(
    lessonId: Int,
    onBack: () -> Unit,
    onOpenChat: () -> Unit,
    onOpenFlashcards: () -> Unit,
) {
    val vm: TermsViewModel = viewModel(
        key = "terms-$lessonId",
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return TermsViewModel(lessonId) as T
            }
        },
    )
    val state by vm.state.collectAsState()
    val c = colors()

    Scaffold(
        containerColor = c.bgCanvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.terms_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bgSurface, titleContentColor = c.textPrimary),
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val s = state) {
                is UiState.Loading -> CenteredLoader(stringResource(R.string.terms_loading))
                is UiState.Error -> CenteredError(s.message, onRetry = vm::load)
                is UiState.Data -> {
                    if (s.value.isEmpty()) {
                        EmptyState(
                            title = stringResource(R.string.terms_empty),
                            subtitle = stringResource(R.string.terms_ask_question),
                            emoji = "📖",
                            actionLabel = stringResource(R.string.lesson_action_chat),
                            onAction = onOpenChat,
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(count = s.value.size) { i ->
                                val t = s.value[i]
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = c.bgSurface,
                                    shadowElevation = 1.dp,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(t.term, style = MaterialTheme.typography.titleMedium, color = c.primary)
                                        Text(t.explanation, style = MaterialTheme.typography.bodyMedium, color = c.textPrimary)
                                    }
                                }
                            }
                            item {
                                Spacer(Modifier.height(4.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = onOpenFlashcards,
                                        modifier = Modifier.weight(1f).height(48.dp),
                                    ) {
                                        Icon(Icons.Default.Style, contentDescription = null)
                                        Spacer(Modifier.width(6.dp))
                                        Text(stringResource(R.string.lesson_action_flashcards))
                                    }
                                    Button(
                                        onClick = onOpenChat,
                                        modifier = Modifier.weight(1f).height(48.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = c.primary),
                                    ) {
                                        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null)
                                        Spacer(Modifier.width(6.dp))
                                        Text(stringResource(R.string.terms_ask_question))
                                    }
                                }
                                Spacer(Modifier.height(20.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

