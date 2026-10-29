package com.example.autodlh3.sceneprobe;

import android.app.Activity;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.*;
import android.graphics.BitmapFactory;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.*;

public class MainActivity extends Activity {
  private WebView web;
  private String read(String name) throws Exception {
    File file = new File(getFilesDir(), name);
    if (!file.exists()) return "";
    try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[4096]; int length;
      while ((length = input.read(buffer)) != -1) { if (out.size() + length > 1024 * 1024) throw new Exception("read budget"); out.write(buffer, 0, length); }
      return out.toString("UTF-8");
    }
  }
  private void write(String name, byte[] data) throws Exception {
    File temporary = new File(getFilesDir(), name + ".tmp");
    try (FileOutputStream stream = new FileOutputStream(temporary)) { stream.write(data); stream.getFD().sync(); }
    if (!temporary.renameTo(new File(getFilesDir(), name))) throw new Exception("atomic write failed");
  }
  private String hash(byte[] data) throws Exception {
    StringBuilder result = new StringBuilder();
    for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) result.append(String.format("%02x", b & 255));
    return result.toString();
  }
  public class Bridge {
    @JavascriptInterface public String saveScene(String encoded) {
      try {
        if (encoded.length() > 100000) throw new Exception("scene budget");
        JSONObject scene = new JSONObject(encoded);
        if (scene.getInt("schemaVersion") != 1 || scene.getJSONArray("objects").length() > 100 || scene.getJSONArray("camera").length() != 3) throw new Exception("scene schema");
        byte[] bytes = encoded.getBytes(StandardCharsets.UTF_8); String id = hash(bytes);
        write("scene-" + id + ".json", bytes); write("current.txt", id.getBytes(StandardCharsets.UTF_8));
        return id;
      } catch (Exception error) { Log.e("SceneProbe", "save", error); return ""; }
    }
    @JavascriptInterface public String loadScene() {
      try { String id = read("current.txt"); return id.matches("[a-f0-9]{64}") ? read("scene-" + id + ".json") : ""; }
      catch (Exception error) { return ""; }
    }
    @JavascriptInterface public String exportPng(String sceneId, String base64) {
      try {
        if (!sceneId.matches("[a-f0-9]{64}") || base64.length() > 8 * 1024 * 1024 || read("scene-" + sceneId + ".json").isEmpty()) throw new Exception("export source");
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        if (bytes.length < 8 || bytes[0] != (byte)137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71) throw new Exception("not PNG");
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (options.outWidth != 1280 || options.outHeight != 720) throw new Exception("export size");
        String id = hash(bytes); write("image-" + id + ".png", bytes);
        JSONObject manifest = new JSONObject(); manifest.put("schemaVersion", 1); manifest.put("sceneVersion", sceneId); manifest.put("imageSha256", id); manifest.put("width", 1280); manifest.put("height", 720);
        write("export.json", manifest.toString().getBytes(StandardCharsets.UTF_8)); return id;
      } catch (Exception error) { Log.e("SceneProbe", "export", error); return ""; }
    }
    @JavascriptInterface public void metric(String json) {
      if (json.length() > 20000) return;
      try (FileOutputStream stream = new FileOutputStream(new File(getFilesDir(), "metrics.jsonl"), true)) { new JSONObject(json); stream.write((json + "\n").getBytes(StandardCharsets.UTF_8)); Log.i("SceneProbe", json); }
      catch (Exception error) { Log.e("SceneProbe", "metric", error); }
    }
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state); web = new WebView(this); setContentView(web);
    web.getSettings().setJavaScriptEnabled(true); web.getSettings().setAllowFileAccess(true);
    web.getSettings().setAllowContentAccess(false); web.getSettings().setBlockNetworkLoads(true);
    web.addJavascriptInterface(new Bridge(), "SceneHost");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return request.getUrl().toString().startsWith("file:///android_asset/") ? null : new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
      }
    });
    web.setWebChromeClient(new WebChromeClient() { @Override public boolean onConsoleMessage(ConsoleMessage message) { Log.i("SceneProbeJS", message.message()); return true; } });
    web.loadUrl("file:///android_asset/index.html");
  }
  @Override public void onPause() { super.onPause(); web.onPause(); }
  @Override public void onResume() { super.onResume(); if (web != null) web.onResume(); }
  @Override public void onDestroy() { web.removeJavascriptInterface("SceneHost"); web.destroy(); super.onDestroy(); }
}
