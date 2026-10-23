package com.example.autodlh3
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
class CreativePdfInstrumentedTest {
  @Test fun rendersBoundedPagesAndRejectsWrongIdentityOrPage() {
    val context=InstrumentationRegistry.getInstrumentation().targetContext
    val file=File(context.cacheDir,"pdf-test-${UUID.randomUUID()}.pdf")
    val outputs=mutableListOf<File>()
    try {
      val document=PdfDocument()
      try {
        for(i in 0..1){val page=document.startPage(PdfDocument.PageInfo.Builder(400,800,i+1).create());page.canvas.drawColor(if(i==0)Color.RED else Color.BLUE);document.finishPage(page)}
        file.outputStream().use(document::writeTo)
      } finally { document.close() }
      val hash=file.inputStream().use(MediaIntegrity::sha256)
      val preview=CreativePdfPreview(context)
      for(i in 0..1){
        val page=preview.render(Uri.fromFile(file).toString(),hash,i)
        assertEquals(2,page.pageCount);assertEquals(600,page.width);assertEquals(1200,page.height)
        val output=File(Uri.parse(page.uri).path!!);outputs.add(output)
        val bitmap=BitmapFactory.decodeFile(output.path)
        assertEquals(if(i==0)Color.RED else Color.BLUE,bitmap.getPixel(300,600));bitmap.recycle()
        assertEquals(page.uri,preview.render(Uri.fromFile(file).toString(),hash,i).uri)
      }
      for((identity,index) in listOf("0".repeat(64) to 0,hash to 2,hash to -1)){
        try{preview.render(Uri.fromFile(file).toString(),identity,index);fail("Must reject invalid identity/page")}catch(_:IllegalArgumentException){}
      }
    }finally{file.delete();outputs.forEach{it.delete()}}
  }
}
