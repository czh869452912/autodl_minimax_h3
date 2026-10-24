package com.example.autodlh3

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.concurrent.TimeUnit

class NovelAiTagSuggestions(private val endpoint: String = "https://image.novelai.net/ai/generate-image/suggest-tags") {
  fun search(model: String, prompt: String, token: String): String {
    require(model in listOf("nai-diffusion-5-full", "nai-diffusion-5-curated", "nai-diffusion-4-5-full", "nai-diffusion-4-5-curated"))
    require(prompt.isNotBlank() && prompt.length <= 100 && token.length in 8..4096 && !token.contains('\n') && !token.contains('\r'))
    val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(20, TimeUnit.SECONDS).build()
    val url = endpoint.toHttpUrl().newBuilder().addQueryParameter("model", model).addQueryParameter("prompt", prompt).addQueryParameter("lang", "en").build()
    client.newCall(Request.Builder().url(url).header("Authorization", "Bearer $token").header("Accept", "application/json").build()).execute().use { response ->
      check(response.isSuccessful)
      val body = requireNotNull(response.body)
      require(body.contentLength() <= 1024 * 1024)
      val bytes = body.byteStream().use { stream -> java.io.ByteArrayOutputStream().use { output ->
        val buffer = ByteArray(8192)
        while (true) { val n = stream.read(buffer); if (n < 0) break; require(output.size() + n <= 1024 * 1024); output.write(buffer, 0, n) }
        output.toByteArray()
      } }
      return bytes.toString(Charsets.UTF_8)
    }
  }
}
