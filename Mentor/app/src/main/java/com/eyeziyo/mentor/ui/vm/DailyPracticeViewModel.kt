package com.eyeziyo.mentor.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.eyeziyo.mentor.data.net.MentorLesson
import com.eyeziyo.mentor.data.net.QuizQuestion
import com.eyeziyo.mentor.data.repo.Repos
import com.eyeziyo.mentor.domain.SubjectPalette
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.random.Random

data class DailyQuestion(
    val lesson: MentorLesson,
    val question: QuizQuestion,
    val correctIndex: Int,
)

data class DailyUi(
    val items: List<DailyQuestion>,
    val answers: Map<Int, Int>,
    val loading: Boolean,
    val finished: Boolean,
)

class DailyPracticeViewModel : ViewModel() {
    private val lessonsRepo = Repos.lessons
    private val stats = Repos.stats

    private val _ui = MutableStateFlow(DailyUi(emptyList(), emptyMap(), loading = true, finished = false))
    val ui: StateFlow<DailyUi> = _ui.asStateFlow()

    init { load() }

    private fun load() = viewModelScope.launch {
        // Pull recent lessons; weight selection by 1 / (score+1) so weak topics
        // are picked more often. Cached test payloads provide the questions.
        val lessons = runCatching { lessonsRepo.refreshLessons() }.getOrElse { emptyList() }
            .filter { it.attempt_score != null }

        if (lessons.isEmpty()) {
            _ui.value = DailyUi(emptyList(), emptyMap(), loading = false, finished = false)
            return@launch
        }

        val pool = mutableListOf<DailyQuestion>()
        for (lesson in lessons) {
            val test = runCatching { lessonsRepo.test(lesson.id) }.getOrNull() ?: continue
            val attempt = test.attempt
            test.questions.forEachIndexed { idx, q ->
                // We don't have correct answer outside of test results; the
                // backend returns it after submission. Heuristic: skip questions
                // we can't grade. (When backend later exposes correct_choice on
                // payloads we wire it in here.)
                val correct = attempt?.answers?.getOrNull(idx) ?: -1
                if (correct in q.choices.indices) {
                    pool += DailyQuestion(lesson, q, correct)
                }
            }
        }

        if (pool.isEmpty()) {
            _ui.value = DailyUi(emptyList(), emptyMap(), loading = false, finished = false)
            return@launch
        }

        val weighted = pool.flatMap { dq ->
            val score = dq.lesson.attempt_score ?: 50
            val weight = ((100 - score) / 10).coerceAtLeast(1)
            List(weight) { dq }
        }
        val picked = weighted.shuffled(Random(System.currentTimeMillis())).distinct().take(5)
        _ui.value = DailyUi(picked, emptyMap(), loading = false, finished = false)
    }

    fun answer(idx: Int, choice: Int) {
        _ui.value = _ui.value.copy(answers = _ui.value.answers + (idx to choice))
    }

    fun finish() {
        val items = _ui.value.items
        val correct = items.withIndex().count { (i, it) -> _ui.value.answers[i] == it.correctIndex }
        val score = if (items.isEmpty()) 0 else (correct * 100 / items.size)
        viewModelScope.launch { stats.recordTest(score) }
        _ui.value = _ui.value.copy(finished = true)
    }
}
