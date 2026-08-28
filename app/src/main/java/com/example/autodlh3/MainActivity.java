package com.example.autodlh3;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.media.MediaMetadataRetriever;
import android.graphics.Bitmap;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.Toast;
import android.view.View;
import android.view.ViewGroup;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends Activity {
    private static final String WORKFLOW_ID = "minimax_h3_image_audio_to_video_v2_15s";
    private static final String API_ROOT = "https://autodl.art/api/v1/comfyui/comfyui_workflow/";
    private static final int PICK_FILE_REQUEST = 401;
    private static final int WEB_FILE_CHOOSER_REQUEST = 402;
    private static final long MAX_TOTAL_UPLOAD_BYTES = 50L * 1024L * 1024L;

    private static final String PREFS_NAME = "autodl_h3";
    private static final String TASKS_KEY = "tasks";
    private static final String TOKEN_CIPHER_KEY = "token_cipher";
    private static final String TOKEN_IV_KEY = "token_iv";
    private static final String LLM_KEY_CIPHER_KEY = "llm_key_cipher";
    private static final String LLM_KEY_IV_KEY = "llm_key_iv";
    private static final String LLM_EP_KEY = "llm_endpoint";
    private static final String LLM_MODEL_KEY = "llm_model";
    private static final String TOKEN_ALIAS = "AutoDLH3TokenKey";

    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int previousSystemUiVisibility = 0;
    // Pending callback for assistant-ui's standard <input type="file"> flow.
    private ValueCallback<Uri[]> webFilePathCallback;
    private int pendingMediaKind = 0;
    private final ArrayList<TaskItem> tasks = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private boolean pollInFlight = false;

    private final Runnable pollRunnable = new Runnable() {
        @Override public void run() {
            reconcileDownloads();
            pollTasks();
        }
    };

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                handleDownloadComplete(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L));
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.contains("android_asset/")) {
                    int idx = url.indexOf("android_asset/");
                    String assetPath = url.substring(idx + "android_asset/".length());
                    try {
                        InputStream is = getAssets().open(assetPath);
                        String mimeType = getMimeType(assetPath);
                        return new WebResourceResponse(mimeType, "UTF-8", is);
                    } catch (IOException ignored) {
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                previousSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                );
                addContentView(customView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (webFilePathCallback != null) {
                    webFilePathCallback.onReceiveValue(null);
                }
                webFilePathCallback = filePathCallback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    if (intent.getType() == null || intent.getType().isEmpty()) {
                        intent.setType("*/*");
                    }
                    startActivityForResult(intent, WEB_FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    webFilePathCallback = null;
                    filePathCallback.onReceiveValue(null);
                    toast("无法打开文件选择器: " + e.getMessage());
                    return false;
                }
            }
        });
        webView.addJavascriptInterface(new NativeBridge(this), "AndroidBridge");

        loadTasks();

        // Load built web index HTML string with Base URL file:///android_asset/web/
        String html = loadAssetString("web/index.html");
        if (html != null && !html.isEmpty()) {
            webView.loadDataWithBaseURL("file:///android_asset/web/", html, "text/html", "UTF-8", null);
        } else {
            webView.loadUrl("file:///android_asset/web/index.html");
        }

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, RECEIVER_NOT_EXPORTED);
        else registerReceiver(downloadReceiver, filter);

        reconcileDownloads();
        pollTasks();
    }

    @Override
    protected void onResume() {
        super.onResume();
        reconcileDownloads();
        notifyWebTasks();
        pollTasks();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
            return;
        }
        if (webView != null) {
            webView.evaluateJavascript("(window.__autodlMediaLightboxOpen === true)", value -> {
                if ("true".equals(value)) {
                    webView.evaluateJavascript("window.dispatchEvent(new Event('nativeBackPressed'))", null);
                } else {
                    MainActivity.super.onBackPressed();
                }
            });
            return;
        }
        super.onBackPressed();
    }

    private void hideCustomView() {
        if (customView == null) return;
        View view = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        if (view.getParent() instanceof ViewGroup) {
            ((ViewGroup) view.getParent()).removeView(view);
        }
        getWindow().getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
        if (callback != null) callback.onCustomViewHidden();
    }

    private static final String LOCAL_MEDIA_BASE = "content://com.example.autodlh3.localmedia/";

    private String getLocalMediaUri(String taskId) {
        return LOCAL_MEDIA_BASE + Uri.encode(taskId + ".mp4");
    }

    private String loadAssetString(String path) {
        try (InputStream is = getAssets().open(path);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) != -1) {
                baos.write(buffer, 0, read);
            }
            return baos.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return null;
        }
    }

    private String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff2")) return "font/woff2";
        return "text/plain";
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS_NAME, MODE_PRIVATE); }

    public void pickMediaFromWeb(int kind) {
        pendingMediaKind = kind;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(kind == 0 ? "image/*" : "audio/*");
        startActivityForResult(intent, PICK_FILE_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == WEB_FILE_CHOOSER_REQUEST) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            if (webFilePathCallback != null) {
                webFilePathCallback.onReceiveValue(results);
                webFilePathCallback = null;
            }
            return;
        }
        if (requestCode != PICK_FILE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        final int kind = pendingMediaKind;
        executor.execute(() -> {
            try {
                String mime = getContentResolver().getType(uri);
                if (mime == null) mime = kind == 0 ? "image/png" : "audio/mpeg";
                byte[] bytes = readBytes(uri, MAX_TOTAL_UPLOAD_BYTES);
                String dataUri = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);

                JSONObject mediaObj = new JSONObject();
                mediaObj.put("id", (kind == 0 ? "img-" : "audio-") + System.currentTimeMillis());
                mediaObj.put("kind", kind == 0 ? "image" : "audio");
                mediaObj.put("name", queryDisplayName(uri));
                mediaObj.put("mime", mime);
                mediaObj.put("size", bytes.length);
                mediaObj.put("dataUri", dataUri);

                final String mediaJson = mediaObj.toString();
                runOnUiThread(() -> {
                    String script = "if (window.onMediaPicked) { window.onMediaPicked(" + JSONObject.quote(mediaJson) + "); }";
                    webView.evaluateJavascript(script, null);
                });
            } catch (Exception e) {
                runOnUiThread(() -> toast("文件读取失败: " + e.getMessage()));
            }
        });
    }

    public void submitTaskFromWeb(String taskJsonStr) {
        final String token = readTokenSecure();
        if (token.isEmpty()) {
            toast("请先在‘设置’中保存 AutoDL Token");
            return;
        }

        try {
            JSONObject webTask = new JSONObject(taskJsonStr);
            final String prompt = webTask.optString("prompt", "");
            final int duration = webTask.optInt("duration", 5);
            final String resolution = webTask.optString("resolution", "768p竖");
            final String seedText = webTask.optString("seed", "");

            JSONObject body = new JSONObject();
            body.put("prompt", prompt);
            body.put("duration", duration);
            body.put("resolution", resolution);
            if (!seedText.isEmpty()) {
                try { body.put("seed", Long.parseLong(seedText)); } catch (Exception ignored) {}
            }

            JSONArray imagesObj = webTask.optJSONArray("images");
            if (imagesObj != null) {
                for (int i = 0; i < imagesObj.length() && i < 9; i++) {
                    JSONObject img = imagesObj.getJSONObject(i);
                    body.put("ref_image_" + i, img.optString("dataUri", ""));
                }
            }

            JSONArray audiosObj = webTask.optJSONArray("audios");
            if (audiosObj != null) {
                for (int i = 0; i < audiosObj.length() && i < 3; i++) {
                    JSONObject aud = audiosObj.getJSONObject(i);
                    body.put("ref_audio_" + i, aud.optString("dataUri", ""));
                }
            }

            final String requestBody = body.toString();
            executor.execute(() -> {
                try {
                    String response = ApiClient.post(API_ROOT + WORKFLOW_ID, token, requestBody);
                    JSONObject json = new JSONObject(response);
                    if (!"Success".equalsIgnoreCase(json.optString("code"))) {
                        throw new IOException(json.optString("msg", "任务提交失败"));
                    }
                    JSONObject data = json.getJSONObject("data");
                    TaskItem task = new TaskItem(data.getString("task_id"), data.optString("status", "QUEUED"), System.currentTimeMillis());
                    task.prompt = prompt;
                    task.duration = duration;
                    task.resolution = resolution;

                    runOnUiThread(() -> {
                        tasks.add(0, task);
                        saveTasks();
                        notifyWebTasks();
                        toast("任务提交成功");
                        pollTasks();
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> toast(e.getMessage() == null ? "提交失败" : e.getMessage()));
                }
            });
        } catch (JSONException e) {
            toast("解析任务错误: " + e.getMessage());
        }
    }

    private void pollTasks() {
        final String token = readTokenSecure();
        if (token.isEmpty() || pollInFlight || tasks.isEmpty()) return;
        boolean pending = false;
        for (TaskItem task : tasks) {
            if (!task.isTerminal() || needsDownloadReconciliation(task)) pending = true;
        }
        if (!pending) return;
        pollInFlight = true;
        ArrayList<TaskItem> snapshot = new ArrayList<>(tasks);
        executor.execute(() -> {
            for (TaskItem task : snapshot) {
                if (task.isTerminal()) continue;
                try {
                    String response = ApiClient.get(API_ROOT + "result/" + task.id, token);
                    JSONObject json = new JSONObject(response);
                    if (!"Success".equalsIgnoreCase(json.optString("code"))) continue;
                    JSONObject data = json.optJSONObject("data");
                    if (data == null) continue;
                    String rawStatus = data.optString("status", task.status);
                    String normalizedStatus = rawStatus == null ? "QUEUED" : rawStatus.toUpperCase();
                    if ("SUCCESSFUL".equals(normalizedStatus)) normalizedStatus = "SUCCESS";
                    if ("PENDING".equals(normalizedStatus)) normalizedStatus = "QUEUED";
                    if ("EXECUTING".equals(normalizedStatus) || "PROCESSING".equals(normalizedStatus)) normalizedStatus = "RUNNING";

                    final String finalStatus = normalizedStatus;
                    String resultUrl = extractVideoUrl(data.optJSONArray("results"));
                    runOnUiThread(() -> {
                        task.status = finalStatus;
                        if (!resultUrl.isEmpty()) task.videoUrl = resultUrl;
                        task.updatedAt = System.currentTimeMillis();
                        if ("SUCCESS".equalsIgnoreCase(finalStatus) && !task.videoUrl.isEmpty()) startDownloadIfNeeded(task);
                        saveTasks();
                        notifyWebTasks();
                    });
                } catch (Exception ignored) {}
            }
            runOnUiThread(() -> {
                pollInFlight = false;
                boolean stillPending = false;
                for (TaskItem task : tasks) {
                    if (!task.isTerminal() || needsDownloadReconciliation(task)) stillPending = true;
                }
                if (stillPending) handler.postDelayed(pollRunnable, 5000);
            });
        });
    }

    public void retryDownload(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        for (TaskItem task : tasks) {
            if (taskId.equals(task.id)) {
                task.downloadId = 0;
                task.downloadState = "";
                startDownloadIfNeeded(task);
                saveTasks();
                notifyWebTasks();
                break;
            }
        }
    }

    public void deleteTask(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        boolean removed = false;
        for (int i = tasks.size() - 1; i >= 0; i--) {
            if (taskId.equals(tasks.get(i).id)) {
                tasks.remove(i);
                removed = true;
            }
        }
        if (removed) {
            saveTasks();
            notifyWebTasks();
        }
    }

    private void ensurePoster(TaskItem task, File videoFile) {
        if (task.thumbnailUrl != null && !task.thumbnailUrl.isEmpty()) return;
        File poster = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AutoDL-H3/" + task.id + ".jpg");
        if (!poster.getParentFile().exists() && !poster.getParentFile().mkdirs()) return;
        try {
            if (!poster.exists() || poster.length() == 0) {
                MediaMetadataRetriever retriever = new MediaMetadataRetriever();
                retriever.setDataSource(videoFile.getAbsolutePath());
                Bitmap frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if (frame != null) {
                    try (FileOutputStream output = new FileOutputStream(poster)) {
                        frame.compress(Bitmap.CompressFormat.JPEG, 88, output);
                    }
                    frame.recycle();
                }
                retriever.release();
            }
            if (poster.exists() && poster.length() > 0) {
                task.thumbnailUrl = LOCAL_MEDIA_BASE + Uri.encode(task.id + ".jpg");
            }
        } catch (Exception ignored) {
            task.thumbnailUrl = "";
        }
    }

    public void openNativeVideo(String source, String title) {
        if (source == null || source.trim().isEmpty()) return;
        Intent intent = new Intent(this, Media3PlayerActivity.class);
        intent.putExtra(Media3PlayerActivity.EXTRA_SOURCE, Uri.parse(source));
        intent.putExtra(Media3PlayerActivity.EXTRA_TITLE, title == null ? "AutoDL H3 视频" : title);
        startActivity(intent);
    }

    private void startDownloadIfNeeded(TaskItem task) {
        if (task.videoUrl == null || task.videoUrl.isEmpty()) return;

        // 1. Check if the video file already exists on local disk
        File localFile = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AutoDL-H3/" + task.id + ".mp4");
        if (localFile.exists() && localFile.length() > 0) {
            task.localUri = getLocalMediaUri(task.id);
            ensurePoster(task, localFile);
            task.downloadState = "已下载";
            return;
        }

        // 2. Prevent duplicate downloads if already downloaded or in flight
        if ("已下载".equals(task.downloadState) || task.downloadId > 0) return;

        try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(task.videoUrl));
            request.setTitle("AutoDL H3 视频");
            request.setDescription("任务 " + task.id);
            request.setMimeType("video/mp4");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MOVIES, "AutoDL-H3/" + task.id + ".mp4");
            task.downloadId = manager.enqueue(request);
            task.downloadState = "下载中";
        } catch (Exception e) { task.downloadState = "下载失败：" + e.getMessage(); }
    }

    private void handleDownloadComplete(long downloadId) {
        if (downloadId <= 0) return;
        TaskItem target = null;
        for (TaskItem task : tasks) if (task.downloadId == downloadId) { target = task; break; }
        if (target == null) return;
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor != null && cursor.moveToFirst()) {
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    File localFile = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AutoDL-H3/" + target.id + ".mp4");
                    int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    String rawUri = uriColumn >= 0 ? cursor.getString(uriColumn) : "";
                    if (localFile.exists() && localFile.length() > 0) {
                        target.localUri = getLocalMediaUri(target.id);
                        ensurePoster(target, localFile);
                    } else if (rawUri != null && !rawUri.isEmpty()) {
                        target.localUri = rawUri;
                    }
                    target.downloadState = "已下载";
                } else {
                    target.downloadState = "下载失败";
                }
                saveTasks();
                notifyWebTasks();
            }
        } catch (Exception e) {
            target.downloadState = "下载状态未知";
            saveTasks();
            notifyWebTasks();
        }
    }

    private void reconcileDownloads() {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        boolean changed = false;
        for (TaskItem task : tasks) {
            File localFile = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AutoDL-H3/" + task.id + ".mp4");
            if (localFile.exists() && localFile.length() > 0) {
                String localMediaUri = getLocalMediaUri(task.id);
                if (!"已下载".equals(task.downloadState) || !localMediaUri.equals(task.localUri)) {
                    task.localUri = localMediaUri;
                    ensurePoster(task, localFile);
                    task.downloadState = "已下载";
                    changed = true;
                }
                continue;
            }

            if (task.downloadId > 0) {
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(task.downloadId))) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                            String rawUri = uriColumn >= 0 ? cursor.getString(uriColumn) : "";
                            task.localUri = localFile.exists() && localFile.length() > 0
                                    ? getLocalMediaUri(task.id)
                                    : (rawUri != null && !rawUri.isEmpty() ? rawUri : Uri.fromFile(localFile).toString());
                            task.downloadState = "已下载";
                            changed = true;
                        } else if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING) {
                            if (!"下载中".equals(task.downloadState)) {
                                task.downloadState = "下载中";
                                changed = true;
                            }
                        } else if (status == DownloadManager.STATUS_FAILED) {
                            if (!"下载失败".equals(task.downloadState)) {
                                task.downloadState = "下载失败";
                                changed = true;
                            }
                        }
                    }
                } catch (Exception ignored) {}
            } else if ("SUCCESS".equalsIgnoreCase(task.status) && task.videoUrl != null && !task.videoUrl.isEmpty() && !"已下载".equals(task.downloadState)) {
                startDownloadIfNeeded(task);
                changed = true;
            }
        }
        if (changed) { saveTasks(); notifyWebTasks(); }
    }

    private boolean needsDownloadReconciliation(TaskItem task) {
        return task.downloadId > 0
                && !"已下载".equals(task.downloadState)
                && !"下载失败".equals(task.downloadState);
    }

    private String extractVideoUrl(JSONArray results) {
        if (results == null) return "";
        for (int i = 0; i < results.length(); i++) {
            JSONObject result = results.optJSONObject(i);
            if (result == null) continue;
            String url = result.optString("url", "");
            if ("video".equalsIgnoreCase(result.optString("type")) && !url.isEmpty()) return url;
        }
        return results.length() > 0 ? results.optJSONObject(0).optString("url", "") : "";
    }

    public String getTasksJson() {
        JSONArray array = new JSONArray();
        try {
            for (TaskItem task : tasks) {
                JSONObject object = new JSONObject();
                object.put("id", task.id);
                object.put("prompt", task.prompt);
                object.put("status", task.status);
                object.put("resolution", task.resolution);
                object.put("duration", task.duration);
                object.put("createdAt", task.createdAt);
                object.put("updatedAt", task.updatedAt);
                object.put("videoUrl", task.videoUrl);
                object.put("localUri", task.localUri);
                object.put("thumbnailUrl", task.thumbnailUrl);
                object.put("downloadId", task.downloadId);
                object.put("downloadState", task.downloadState);
                array.put(object);
            }
        } catch (JSONException ignored) {}
        return array.toString();
    }

    public void saveTasksJson(String jsonStr) {
        prefs().edit().putString(TASKS_KEY, jsonStr).apply();
        runOnUiThread(() -> {
            loadTasks();
            pollTasks();
        });
    }

    private void notifyWebTasks() {
        final String jsonStr = getTasksJson();
        runOnUiThread(() -> {
            String script = "if (window.onTaskStatusUpdated) { window.onTaskStatusUpdated(" + JSONObject.quote(jsonStr) + "); }";
            webView.evaluateJavascript(script, null);
        });
    }

    public String readTokenSecure() { return readSecure(TOKEN_CIPHER_KEY, TOKEN_IV_KEY); }
    public boolean saveTokenSecure(String token) { return saveSecure(TOKEN_CIPHER_KEY, TOKEN_IV_KEY, token); }

    public String readLlmApiKeySecure() { return readSecure(LLM_KEY_CIPHER_KEY, LLM_KEY_IV_KEY); }
    public String readLlmEndpointSecure() { return prefs().getString(LLM_EP_KEY, "https://api.minimaxi.com/v1"); }
    public String readLlmModelSecure() { return prefs().getString(LLM_MODEL_KEY, "MiniMax-M2.7"); }
    public boolean saveLlmConfigSecure(String apiKey, String endpoint) {
        return saveLlmConfigSecure(apiKey, endpoint, "MiniMax-M2.7");
    }
    public boolean saveLlmConfigSecure(String apiKey, String endpoint, String model) {
        prefs().edit().putString(LLM_EP_KEY, endpoint).putString(LLM_MODEL_KEY, model).apply();
        return saveSecure(LLM_KEY_CIPHER_KEY, LLM_KEY_IV_KEY, apiKey);
    }

    private String readSecure(String cipherKeyStr, String ivKeyStr) {
        try {
            String cipherText = prefs().getString(cipherKeyStr, "");
            String ivText = prefs().getString(ivKeyStr, "");
            if (cipherText.isEmpty() || ivText.isEmpty()) return "";
            SecretKey key = getTokenKey(false);
            if (key == null) return "";
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(ivText, Base64.DEFAULT)));
            return new String(cipher.doFinal(Base64.decode(cipherText, Base64.DEFAULT)), StandardCharsets.UTF_8);
        } catch (Exception ignored) { return ""; }
    }

    private boolean saveSecure(String cipherKeyStr, String ivKeyStr, String value) {
        try {
            if (value.isEmpty()) {
                prefs().edit().remove(cipherKeyStr).remove(ivKeyStr).apply();
                return true;
            }
            SecretKey key = getTokenKey(true);
            if (key == null) return false;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            prefs().edit()
                    .putString(cipherKeyStr, Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP))
                    .putString(ivKeyStr, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
            return true;
        } catch (Exception ignored) { return false; }
    }

    private SecretKey getTokenKey(boolean create) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(TOKEN_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(TOKEN_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        if (!create) return null;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(TOKEN_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private void loadTasks() {
        tasks.clear();
        try {
            JSONArray array = new JSONArray(prefs().getString(TASKS_KEY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.getJSONObject(i);
                TaskItem task = new TaskItem(object.optString("id"), object.optString("status", "QUEUED"), object.optLong("createdAt", System.currentTimeMillis()));
                task.updatedAt = object.optLong("updatedAt", task.createdAt);
                task.prompt = object.optString("prompt", "");
                task.resolution = object.optString("resolution", "768p竖");
                task.duration = object.optInt("duration", 5);
                task.videoUrl = object.optString("videoUrl", "");
                task.localUri = object.optString("localUri", "");
                task.thumbnailUrl = object.optString("thumbnailUrl", "");
                task.downloadId = object.optLong("downloadId", 0);
                task.downloadState = object.optString("downloadState", "");
                tasks.add(task);
            }
        } catch (Exception ignored) {}
    }

    private void saveTasks() { saveTasksJson(getTasksJson()); }

    private byte[] readBytes(Uri uri, long maxBytes) throws IOException {
        try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("无法读取文件");
            byte[] buffer = new byte[16 * 1024];
            int read;
            long total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IOException("文件超过 50 MB");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
        if (cursor != null) {
            try { if (cursor.moveToFirst()) return cursor.getString(0); } finally { cursor.close(); }
        }
        String path = uri.getPath();
        return path == null ? "已选择素材" : path.substring(path.lastIndexOf('/') + 1);
    }

    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    @Override
    protected void onDestroy() {
        hideCustomView();
        handler.removeCallbacks(pollRunnable);
        try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class TaskItem {
        final String id; String status; final long createdAt; long updatedAt;
        String prompt = ""; String resolution = "768p竖"; int duration = 5;
        String videoUrl = ""; String localUri = ""; String thumbnailUrl = ""; long downloadId = 0; String downloadState = "";
        TaskItem(String id, String status, long createdAt) { this.id = id; this.status = status; this.createdAt = createdAt; this.updatedAt = createdAt; }
        boolean isTerminal() { return "SUCCESS".equalsIgnoreCase(status) || "FAILED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status); }
    }

    private static final class ApiClient {
        static String post(String endpoint, String token, String body) throws IOException { return request("POST", endpoint, token, body); }
        static String get(String endpoint, String token) throws IOException { return request("GET", endpoint, token, null); }
        private static String request(String method, String endpoint, String token, String body) throws IOException {
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) new java.net.URL(endpoint).openConnection();
            connection.setRequestMethod(method); connection.setConnectTimeout(30_000); connection.setReadTimeout(120_000); connection.setDoInput(true);
            connection.setRequestProperty("Authorization", token); connection.setRequestProperty("Content-Type", "application/json");
            if (body != null) { connection.setDoOutput(true); byte[] bytes = body.getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length); connection.getOutputStream().write(bytes); }
            int code = connection.getResponseCode(); InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream(); String response = stream == null ? "" : readText(stream);
            if (code < 200 || code >= 300) throw new IOException("HTTP " + code + (response.isEmpty() ? "" : "：" + response));
            return response;
        }
        private static String readText(InputStream stream) throws IOException { try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) { byte[] buffer = new byte[8192]; int read; while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read); return output.toString(StandardCharsets.UTF_8.name()); } }
    }
}
