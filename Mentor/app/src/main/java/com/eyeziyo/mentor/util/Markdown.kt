package com.eyeziyo.mentor.util

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp

/**
 * Tiny hand-rolled Markdown renderer.
 *
 * Supports the patterns AI replies tend to actually use:
 *   - `# heading` (1–3 levels)
 *   - `**bold**`, `*italic*`, `__bold__`, `_italic_`
 *   - `` `code` ``
 *   - Triple-backtick fenced code blocks
 *   - Lines starting with `- `, `* `, or `1. `
 *   - Plain paragraphs separated by blank lines
 *
 * Intentionally NOT supported: tables, links, images, blockquotes, nested
 * lists. We can add them later if AI starts emitting them; until then this
 * keeps the dependency footprint zero and renders quickly.
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    contentColor: Color? = null,
) {
    val color = contentColor ?: LocalContentColor.current
    val blocks = parseBlocks(text)
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MdBlock.Heading -> Text(
                    text = inlineFormat(block.text, color),
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.headlineSmall
                        2 -> MaterialTheme.typography.titleLarge
                        else -> MaterialTheme.typography.titleMedium
                    },
                    color = color,
                )
                is MdBlock.Paragraph -> Text(
                    text = inlineFormat(block.text, color),
                    style = MaterialTheme.typography.bodyMedium,
                    color = color,
                )
                is MdBlock.BulletItem -> Row {
                    Text("•  ", color = color, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = inlineFormat(block.text, color),
                        style = MaterialTheme.typography.bodyMedium,
                        color = color,
                    )
                }
                is MdBlock.NumberedItem -> Row {
                    Text("${block.index}.  ", color = color, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = inlineFormat(block.text, color),
                        style = MaterialTheme.typography.bodyMedium,
                        color = color,
                    )
                }
                is MdBlock.Code -> Text(
                    block.code,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    color = color,
                    modifier = Modifier.padding(PaddingValues(vertical = 4.dp)),
                )
            }
        }
    }
}

private sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Paragraph(val text: String) : MdBlock
    data class BulletItem(val text: String) : MdBlock
    data class NumberedItem(val index: Int, val text: String) : MdBlock
    data class Code(val code: String) : MdBlock
}

private fun parseBlocks(input: String): List<MdBlock> {
    val out = mutableListOf<MdBlock>()
    val lines = input.split("\n")
    var i = 0
    val paraBuf = StringBuilder()

    fun flushPara() {
        if (paraBuf.isNotBlank()) out += MdBlock.Paragraph(paraBuf.toString().trim())
        paraBuf.setLength(0)
    }

    while (i < lines.size) {
        val raw = lines[i]
        val trimmed = raw.trim()
        when {
            trimmed.startsWith("```") -> {
                flushPara()
                val codeBuf = StringBuilder()
                i++
                while (i < lines.size && !lines[i].trim().startsWith("```")) {
                    if (codeBuf.isNotEmpty()) codeBuf.append('\n')
                    codeBuf.append(lines[i])
                    i++
                }
                out += MdBlock.Code(codeBuf.toString())
            }
            trimmed.startsWith("### ") -> { flushPara(); out += MdBlock.Heading(3, trimmed.removePrefix("### ")) }
            trimmed.startsWith("## ") -> { flushPara(); out += MdBlock.Heading(2, trimmed.removePrefix("## ")) }
            trimmed.startsWith("# ") -> { flushPara(); out += MdBlock.Heading(1, trimmed.removePrefix("# ")) }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                flushPara(); out += MdBlock.BulletItem(trimmed.drop(2))
            }
            Regex("^\\d+\\.\\s").containsMatchIn(trimmed) -> {
                flushPara()
                val match = Regex("^(\\d+)\\.\\s(.*)").matchEntire(trimmed)
                if (match != null) {
                    out += MdBlock.NumberedItem(match.groupValues[1].toInt(), match.groupValues[2])
                } else {
                    out += MdBlock.Paragraph(trimmed)
                }
            }
            trimmed.isEmpty() -> flushPara()
            else -> {
                if (paraBuf.isNotEmpty()) paraBuf.append(' ')
                paraBuf.append(trimmed)
            }
        }
        i++
    }
    flushPara()
    return out
}

/**
 * Inline span parser. Walks the line once and emits styled spans for the
 * supported markers. Unmatched markers stay as literal characters so the user
 * never sees a half-styled stub.
 */
internal fun inlineFormat(text: String, defaultColor: Color): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val rest = text.substring(i)
        when {
            rest.startsWith("**") -> {
                val end = text.indexOf("**", i + 2)
                if (end > 0) {
                    pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
                    append(text.substring(i + 2, end))
                    pop()
                    i = end + 2
                } else { append(text[i]); i++ }
            }
            rest.startsWith("__") -> {
                val end = text.indexOf("__", i + 2)
                if (end > 0) {
                    pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
                    append(text.substring(i + 2, end))
                    pop()
                    i = end + 2
                } else { append(text[i]); i++ }
            }
            rest.startsWith("`") -> {
                val end = text.indexOf("`", i + 1)
                if (end > 0) {
                    pushStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x14000000)))
                    append(text.substring(i + 1, end))
                    pop()
                    i = end + 1
                } else { append(text[i]); i++ }
            }
            rest.startsWith("*") -> {
                val end = text.indexOf("*", i + 1)
                if (end > 0 && end - i > 1) {
                    pushStyle(SpanStyle(fontStyle = FontStyle.Italic))
                    append(text.substring(i + 1, end))
                    pop()
                    i = end + 1
                } else { append(text[i]); i++ }
            }
            rest.startsWith("_") -> {
                val end = text.indexOf("_", i + 1)
                if (end > 0 && end - i > 1) {
                    pushStyle(SpanStyle(fontStyle = FontStyle.Italic))
                    append(text.substring(i + 1, end))
                    pop()
                    i = end + 1
                } else { append(text[i]); i++ }
            }
            rest.startsWith("~~") -> {
                val end = text.indexOf("~~", i + 2)
                if (end > 0) {
                    pushStyle(SpanStyle(textDecoration = TextDecoration.LineThrough))
                    append(text.substring(i + 2, end))
                    pop()
                    i = end + 2
                } else { append(text[i]); i++ }
            }
            else -> { append(text[i]); i++ }
        }
    }
}
