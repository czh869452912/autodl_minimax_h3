package com.example.autodlh3

internal object CompatibilityDiagnostics {
  fun sanitize(value: String): String = value
    .replace(Regex("(?i)(?:https?|content|file)://[^\\s'\"]+"), "[uri]")
    .replace(Regex("(?:[A-Za-z]:)?[/\\\\][^\\s'\"]+"), "[path]")
    .replace(Regex("(?i)X-Tos-[^\\s]+"), "[signature]")
    .replace(Regex("[\\p{Cntrl}&&[^\\n\\t]]"), "")
    .takeLast(2048)
}
