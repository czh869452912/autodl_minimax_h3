package com.example.autodlh3

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class NovelAiTagSuggestionsTest {
  @Test fun queryEncodesUserTextAndKeepsCredentialsOutOfTheUrl() {
    val server=MockWebServer();server.start()
    try {
      server.enqueue(MockResponse().setBody("{\"tags\":[{\"tag\":\"telescope\"}]}"))
      val raw=NovelAiTagSuggestions(server.url("/suggest").toString()).search("nai-diffusion-5-full","星空 & telescope","private-token")
      assertTrue(raw.contains("telescope"));val request=server.takeRequest()
      assertEquals("星空 & telescope",request.requestUrl!!.queryParameter("prompt"));assertEquals("en",request.requestUrl!!.queryParameter("lang"));assertEquals("Bearer private-token",request.getHeader("Authorization"));assertFalse(request.path!!.contains("private-token"))
      assertThrows(IllegalArgumentException::class.java) { NovelAiTagSuggestions(server.url("/").toString()).search("unvalidated-model","tag","private-token") }
      assertEquals(1,server.requestCount)
    } finally {server.shutdown()}
  }
}
