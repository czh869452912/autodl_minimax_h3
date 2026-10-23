package com.example.autodlh3
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.zip.CRC32
import java.util.zip.DeflaterOutputStream
import org.junit.Assert.*
import org.junit.Test
class CreativePngMetadataTest {
  private fun png(type:String,data:ByteArray):ByteArray{val out=ByteArrayOutputStream();val stream=DataOutputStream(out);stream.write(byteArrayOf(137.toByte(),80,78,71,13,10,26,10));for((name,body)in listOf(type to data,"IEND" to byteArrayOf())){val bytes=name.toByteArray();stream.writeInt(body.size);stream.write(bytes);stream.write(body);val crc=CRC32();crc.update(bytes);crc.update(body);stream.writeInt(crc.value.toInt())};return out.toByteArray()}
  private fun compressed(s:String):ByteArray{val out=ByteArrayOutputStream();DeflaterOutputStream(out).use{it.write(s.toByteArray())};return out.toByteArray()}
  @Test fun readsPlainCompressedAndUnicodeText(){
    assertEquals("prompt",CreativePngMetadata.read(png("tEXt","Description\u0000prompt".toByteArray()).inputStream())["Description"])
    assertEquals("{\"seed\":12}",CreativePngMetadata.read(png("zTXt","Comment\u0000\u0000".toByteArray()+compressed("{\"seed\":12}")).inputStream())["Comment"])
    assertEquals("星空",CreativePngMetadata.read(png("iTXt","Description\u0000\u0000\u0000\u0000\u0000星空".toByteArray()).inputStream())["Description"])
  }
  @Test fun rejectsCorruptionAndDecompressionBomb(){
    val corrupt=png("tEXt","Comment\u0000data".toByteArray());corrupt[20]=(corrupt[20].toInt() xor 1).toByte()
    assertThrows(IllegalArgumentException::class.java){CreativePngMetadata.read(corrupt.inputStream())}
    val bomb=png("zTXt","Comment\u0000\u0000".toByteArray()+compressed("a".repeat(CreativePngMetadata.MAX_TEXT+1)))
    assertThrows(IllegalArgumentException::class.java){CreativePngMetadata.read(bomb.inputStream())}
  }
}
