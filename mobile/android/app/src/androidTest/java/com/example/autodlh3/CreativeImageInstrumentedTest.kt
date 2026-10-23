package com.example.autodlh3

import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class CreativeImageInstrumentedTest {
  @Test fun exportsAndReconcilesStandaloneImageWithoutDuplicatingIt() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val source = File(context.cacheDir, "creative-${UUID.randomUUID()}.png")
    val bitmap = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888)
    bitmap.eraseColor(android.graphics.Color.BLUE)
    source.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    val hash = source.inputStream().use(MediaIntegrity::sha256)
    val key = MediaIntegrity.sha256(UUID.randomUUID().toString().byteInputStream())
    val gateway = AndroidMediaStoreGateway(context.contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
    val publisher = CreativeImagePublisher(gateway) { File(Uri.parse(it).path!!).inputStream() }
    var uri: String? = null
    try {
      uri = publisher.publish(Uri.fromFile(source).toString(), key, "image/png", hash)
      assertEquals(uri, publisher.lookup(key, "image/png", hash))
      assertEquals(uri, publisher.publish(Uri.fromFile(source).toString(), key, "image/png", hash))
      assertEquals(1, gateway.query("creative-$key.png", "Pictures/AutoDL-H3/").size)
      assertEquals(hash, gateway.openInput(uri)!!.use(MediaIntegrity::sha256))
      source.delete()
      // Receipt reconciliation does not require the original private file.
      assertEquals(uri, publisher.lookup(key, "image/png", hash))
    } finally { uri?.let(gateway::delete); source.delete() }
  }
}
