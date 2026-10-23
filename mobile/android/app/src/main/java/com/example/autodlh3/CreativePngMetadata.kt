package com.example.autodlh3

import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.InputStream
import java.util.zip.CRC32
import java.util.zip.InflaterInputStream

object CreativePngMetadata {
  const val MAX_TEXT = 512 * 1024
  private fun bounded(input: InputStream): ByteArray {
    val out = java.io.ByteArrayOutputStream(); val buffer=ByteArray(4096)
    while(true){val n=input.read(buffer);if(n<0)break;require(out.size()+n<=MAX_TEXT){"METADATA_TOO_LARGE"};out.write(buffer,0,n)}
    return out.toByteArray()
  }
  fun read(source: InputStream): Map<String,String> {
    val input=DataInputStream(source);val magic=ByteArray(8)
    if(input.read(magic)!=8 || !magic.contentEquals(byteArrayOf(137.toByte(),80,78,71,13,10,26,10)))return emptyMap()
    val result=linkedMapOf<String,String>();var total=8L;var textSize=0
    while(true){
      val length=input.readInt();require(length>=0 && length<=20*1024*1024){"PNG_CHUNK_TOO_LARGE"};total+=length+12L;require(total<=32*1024*1024){"PNG_TOO_LARGE"}
      val type=ByteArray(4);input.readFully(type);val name=String(type,Charsets.US_ASCII)
      val crc=CRC32();crc.update(type)
      val textChunk=name in listOf("tEXt","zTXt","iTXt")
      val payload=if(textChunk){require(length<=MAX_TEXT){"METADATA_TOO_LARGE"};ByteArray(length).also{input.readFully(it);crc.update(it)}}else{
        val buffer=ByteArray(8192);var remaining=length;while(remaining>0){val n=minOf(remaining,buffer.size);input.readFully(buffer,0,n);crc.update(buffer,0,n);remaining-=n};null
      }
      require(input.readInt().toLong().and(0xffffffffL)==crc.value){"PNG_CRC_INVALID"}
      if(payload!=null){
        val zero=payload.indexOf(0);require(zero in 1..79){"PNG_KEY_INVALID"};val key=String(payload,0,zero,Charsets.ISO_8859_1)
        val text=when(name){
          "tEXt"->String(payload.copyOfRange(zero+1,payload.size),Charsets.ISO_8859_1)
          "zTXt"->{require(zero+2<=payload.size&&payload[zero+1].toInt()==0);String(InflaterInputStream(ByteArrayInputStream(payload,zero+2,payload.size-zero-2)).use{bounded(it)},Charsets.ISO_8859_1)}
          else->{var pos=zero+1;require(pos+2<=payload.size);val compressed=payload[pos++].toInt();require(compressed in 0..1&&payload[pos++].toInt()==0)
            repeat(2){while(pos<payload.size&&payload[pos].toInt()!=0)pos++;require(pos<payload.size);pos++}
            val data=payload.copyOfRange(pos,payload.size);String(if(compressed==1)InflaterInputStream(ByteArrayInputStream(data)).use{bounded(it)}else data,Charsets.UTF_8)}
        }
        textSize+=text.length;require(textSize<=MAX_TEXT && result.size<64){"METADATA_TOO_LARGE"};require(!result.containsKey(key)){"PNG_DUPLICATE_METADATA"};result[key]=text
      }
      if(name=="IEND")break
    }
    return result
  }
}
