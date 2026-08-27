package com.example.autodlh3;

import android.app.Activity;
import android.app.Dialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Native Android client for AutoDL.Art's MiniMax H3 ComfyUI workflow. */
public class MainActivity extends Activity {
    private static final String WORKFLOW_ID = "minimax_h3_image_audio_to_video_v2_15s";
    private static final String API_ROOT = "https://autodl.art/api/v1/comfyui/comfyui_workflow/";
    private static final int PICK_FILE_REQUEST = 401;
    private static final long MAX_TOTAL_UPLOAD_BYTES = 50L * 1024L * 1024L;
    private static final String PREFS_NAME = "autodl_h3";
    private static final String TASKS_KEY = "tasks";
    private static final String TOKEN_CIPHER_KEY = "token_cipher";
    private static final String TOKEN_IV_KEY = "token_iv";
    private static final String TOKEN_ALIAS = "AutoDLH3TokenKey";

    private EditText tokenInput;
    private EditText promptInput;
    private EditText durationInput;
    private EditText seedInput;
    private Spinner resolutionInput;
    private Button submitButton;
    private ProgressBar submitProgress;
    private LinearLayout mediaContainer;
    private TextView mediaSummary;
    private LinearLayout tasksContainer;
    private LinearLayout resultsContainer;
    private TextView[] tabLabels;
    private View[] pages;

    private final ArrayList<MediaItem> images = new ArrayList<>();
    private final ArrayList<MediaItem> audios = new ArrayList<>();
    private final ArrayList<TaskItem> tasks = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private int pendingMediaKind = 0;
    private boolean pollInFlight = false;
    private MediaPlayer mediaPlayer;
    private Button activeAudioButton;

    private final Runnable pollRunnable = new Runnable() {
        @Override public void run() { pollTasks(); }
    };

    /** DownloadManager broadcasts are not delivered reliably by every Android vendor ROM. */
    private final Runnable downloadPollRunnable = new Runnable() {
        @Override public void run() { refreshAllViews(); }
    };

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                handleDownloadComplete(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L));
            }
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        loadTasks();
        tokenInput.setText(readTokenSecure());
        refreshAllViews();
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, RECEIVER_NOT_EXPORTED);
        else registerReceiver(downloadReceiver, filter);
        reconcileDownloads();
        refreshAllViews();
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS_NAME, MODE_PRIVATE); }

    private void buildUi() {
        LinearLayout root = column();
        root.setBackgroundColor(Color.rgb(247, 248, 252));

        LinearLayout header = column();
        header.setPadding(dp(18), dp(16), dp(18), dp(8));
        TextView title = text("AutoDL H3 视频生成", 23, Color.rgb(25, 28, 38));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, matchWrap());
        TextView subtitle = text("图片与音频参考生视频", 13, Color.GRAY);
        subtitle.setPadding(0, dp(3), 0, dp(2));
        header.addView(subtitle, matchWrap());
        root.addView(header, matchWrap());

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        View generate = buildGeneratePage();
        View queue = buildQueuePage();
        View result = buildResultPage();
        View settings = buildSettingsPage();
        pages = new View[]{generate, queue, result, settings};
        for (View page : pages) content.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout tabBar = row();
        tabBar.setBackgroundColor(Color.WHITE);
        tabBar.setPadding(dp(4), dp(4), dp(4), dp(4));
        tabLabels = new TextView[4];
        String[] labels = {"生成", "任务队列", "结果", "设置"};
        for (int i = 0; i < labels.length; i++) {
            final int index = i;
            TextView tab = text(labels[i], 13, Color.GRAY);
            tab.setGravity(Gravity.CENTER);
            tab.setPadding(0, dp(8), 0, dp(8));
            tab.setOnClickListener(v -> showTab(index));
            tabLabels[i] = tab;
            tabBar.addView(tab, new LinearLayout.LayoutParams(0, dp(48), 1));
        }
        root.addView(tabBar, matchWrap());
        setContentView(root);
        showTab(0);
    }

    private View buildGeneratePage() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = column();
        page.setPadding(dp(18), dp(6), dp(18), dp(20));
        scroll.addView(page);
        page.addView(sectionTitle("描述你想生成的视频"), matchWrap());
        promptInput = edit("Prompt：主体、动作、场景、镜头运动", true);
        promptInput.setMinLines(5);
        promptInput.setGravity(Gravity.TOP | Gravity.START);
        page.addView(promptInput, matchWrapWithBottom(12));

        LinearLayout parameterRow = row();
        durationInput = edit("时长 1-15 秒", false);
        durationInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        durationInput.setText("5");
        parameterRow.addView(durationInput, weightParams(1, 8));
        seedInput = edit("Seed（可选）", false);
        seedInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        parameterRow.addView(seedInput, weightParams(1, 8));
        resolutionInput = new Spinner(this);
        String[] resolutions = {"768p竖", "480p竖", "768p横", "480p横"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, resolutions);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        resolutionInput.setAdapter(adapter);
        parameterRow.addView(resolutionInput, weightParams(1.25f, 0));
        page.addView(parameterRow, matchWrapWithBottom(16));

        LinearLayout mediaHeader = row();
        TextView mediaTitle = sectionTitle("参考素材");
        mediaHeader.addView(mediaTitle, weightParams(1, 0));
        mediaSummary = text("图片 0/9 · 音频 0/3", 12, Color.GRAY);
        mediaSummary.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        mediaHeader.addView(mediaSummary, wrapParams());
        page.addView(mediaHeader, matchWrap());
        TextView mediaHint = text("添加后会直接预览；可以继续添加下一张或下一段音频。", 12, Color.GRAY);
        mediaHint.setPadding(0, 0, 0, dp(8));
        page.addView(mediaHint, matchWrap());

        mediaContainer = column();
        page.addView(mediaContainer, matchWrapWithBottom(8));
        LinearLayout addRow = row();
        Button addImage = new Button(this);
        addImage.setText("＋ 添加图片");
        addImage.setOnClickListener(v -> pickMedia(0));
        addRow.addView(addImage, weightParams(1, 8));
        Button addAudio = new Button(this);
        addAudio.setText("＋ 添加音频");
        addAudio.setOnClickListener(v -> pickMedia(1));
        addRow.addView(addAudio, weightParams(1, 0));
        page.addView(addRow, matchWrapWithBottom(18));

        LinearLayout submitRow = row();
        submitButton = new Button(this);
        submitButton.setText("提交生成");
        submitButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        submitButton.setOnClickListener(v -> submitTask());
        submitRow.addView(submitButton, weightParams(1, 10));
        submitProgress = new ProgressBar(this);
        submitProgress.setVisibility(View.GONE);
        submitRow.addView(submitProgress, new LinearLayout.LayoutParams(dp(40), dp(40)));
        page.addView(submitRow, matchWrapWithBottom(12));
        page.addView(text("提交前请到“设置”中保存 AutoDL ComfyUI Token。", 12, Color.GRAY), matchWrap());
        return scroll;
    }

    private View buildQueuePage() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = column();
        page.setPadding(dp(18), dp(10), dp(18), dp(20));
        scroll.addView(page);
        LinearLayout header = row();
        header.addView(sectionTitle("任务队列"), weightParams(1, 0));
        Button refresh = new Button(this);
        refresh.setText("刷新");
        refresh.setOnClickListener(v -> pollTasks());
        header.addView(refresh, wrapParams());
        page.addView(header, matchWrap());
        TextView hint = text("显示本机提交的任务。任务完成后会自动下载视频。", 12, Color.GRAY);
        hint.setPadding(0, 0, 0, dp(10));
        page.addView(hint, matchWrap());
        tasksContainer = column();
        page.addView(tasksContainer, matchWrap());
        return scroll;
    }

    private View buildResultPage() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = column();
        page.setPadding(dp(18), dp(10), dp(18), dp(20));
        scroll.addView(page);
        page.addView(sectionTitle("生成结果"), matchWrap());
        TextView hint = text("视频完成自动下载后，可以直接在这里播放预览。", 12, Color.GRAY);
        hint.setPadding(0, 0, 0, dp(10));
        page.addView(hint, matchWrap());
        resultsContainer = column();
        page.addView(resultsContainer, matchWrap());
        return scroll;
    }

    private View buildSettingsPage() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = column();
        page.setPadding(dp(18), dp(10), dp(18), dp(20));
        scroll.addView(page);
        page.addView(sectionTitle("连接设置"), matchWrap());
        tokenInput = edit("AutoDL ComfyUI Token", false);
        tokenInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        page.addView(tokenInput, matchWrapWithBottom(8));
        Button save = new Button(this);
        save.setText("保存 Token");
        save.setOnClickListener(v -> {
            String token = tokenInput.getText().toString().trim();
            if (saveTokenSecure(token)) {
                toast(token.isEmpty() ? "已清除 Token" : "Token 已安全保存");
                pollTasks();
            } else toast("Token 保存失败，仅在本次运行中使用");
        });
        page.addView(save, wrapParams());
        TextView security = text("Token 使用 Android Keystore 加密保存，不会写入源码或 APK。", 12, Color.GRAY);
        security.setPadding(0, dp(6), 0, dp(18));
        page.addView(security, matchWrap());
        page.addView(sectionTitle("工作流信息"), matchWrap());
        TextView workflow = text("MiniMax H3 多图多音频生视频\n工作流 ID：" + WORKFLOW_ID + "\n支持：最多 9 张图片、3 段音频，时长 1-15 秒", 13, Color.DKGRAY);
        workflow.setPadding(0, 0, 0, dp(18));
        page.addView(workflow, matchWrap());
        page.addView(sectionTitle("注意事项"), matchWrap());
        page.addView(text("• 素材会以 Base64 直接发送，单次总量限制为 50 MB。\n• 生成成功后视频链接有效期较短，应用会立即加入自动下载。\n• 下载文件保存在 Movies/AutoDL-H3。", 13, Color.DKGRAY), matchWrap());
        return scroll;
    }

    private void showTab(int index) {
        if (pages == null) return;
        for (int i = 0; i < pages.length; i++) pages[i].setVisibility(i == index ? View.VISIBLE : View.GONE);
        if (tabLabels != null) {
            for (int i = 0; i < tabLabels.length; i++) {
                tabLabels[i].setTextColor(i == index ? Color.rgb(67, 56, 202) : Color.GRAY);
                tabLabels[i].setTypeface(Typeface.DEFAULT, i == index ? Typeface.BOLD : Typeface.NORMAL);
            }
        }
        if (index == 1 || index == 2) refreshAllViews();
    }

    private void pickMedia(int kind) {
        if (kind == 0 && images.size() >= 9) { toast("最多添加 9 张图片"); return; }
        if (kind == 1 && audios.size() >= 3) { toast("最多添加 3 段音频"); return; }
        pendingMediaKind = kind;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(kind == 0 ? "image/*" : "audio/*");
        startActivityForResult(intent, PICK_FILE_REQUEST);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        final int kind = pendingMediaKind;
        executor.execute(() -> {
            try {
                String mime = getContentResolver().getType(uri);
                if (!isAcceptedMime(mime, kind)) throw new IOException("不支持的文件类型：" + (mime == null ? "未知" : mime));
                byte[] bytes = readBytes(uri, MAX_TOTAL_UPLOAD_BYTES);
                if (selectedBytes() + bytes.length > MAX_TOTAL_UPLOAD_BYTES) throw new IOException("所有上传文件大小总和不能超过 50 MB");
                String safeMime = mime == null ? (kind == 0 ? "image/png" : "audio/mpeg") : mime;
                String dataUri = "data:" + safeMime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                MediaItem item = new MediaItem(kind, uri, queryDisplayName(uri), safeMime, bytes.length, dataUri);
                runOnUiThread(() -> {
                    if (kind == 0) images.add(item); else audios.add(item);
                    refreshMediaView();
                    toast((kind == 0 ? "图片" : "音频") + "已添加");
                });
            } catch (Exception e) {
                runOnUiThread(() -> toast(e.getMessage() == null ? "文件读取失败" : e.getMessage()));
            }
        });
    }

    private void refreshMediaView() {
        if (mediaContainer == null) return;
        mediaContainer.removeAllViews();
        for (int i = 0; i < images.size(); i++) mediaContainer.addView(createImagePreview(images.get(i), i), matchWrapWithBottom(8));
        for (int i = 0; i < audios.size(); i++) mediaContainer.addView(createAudioPreview(audios.get(i), i), matchWrapWithBottom(8));
        if (images.isEmpty() && audios.isEmpty()) {
            TextView empty = text("还没有添加参考素材", 13, Color.GRAY);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, dp(12), 0, dp(12));
            mediaContainer.addView(empty, matchWrap());
        }
        mediaSummary.setText(String.format(Locale.US, "图片 %d/9 · 音频 %d/3", images.size(), audios.size()));
    }

    private View createImagePreview(MediaItem item, int index) {
        LinearLayout card = row();
        card.setPadding(dp(8), dp(8), dp(8), dp(8));
        card.setBackgroundColor(Color.WHITE);
        ImageView preview = new ImageView(this);
        preview.setScaleType(ImageView.ScaleType.CENTER_CROP);
        preview.setImageURI(item.uri);
        card.addView(preview, new LinearLayout.LayoutParams(dp(74), dp(74)));
        LinearLayout info = column();
        info.setPadding(dp(10), 0, dp(6), 0);
        TextView type = text("图片 " + (index + 1), 13, Color.DKGRAY);
        type.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        info.addView(type, matchWrap());
        TextView name = text(item.name + "\n" + String.format(Locale.US, "%.2f MB", item.size / 1024.0 / 1024.0), 12, Color.GRAY);
        name.setMaxLines(2);
        name.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        info.addView(name, matchWrap());
        card.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button remove = new Button(this);
        remove.setText("移除");
        remove.setOnClickListener(v -> { images.remove(item); refreshMediaView(); });
        card.addView(remove, wrapParams());
        return card;
    }

    private View createAudioPreview(MediaItem item, int index) {
        LinearLayout card = row();
        card.setPadding(dp(8), dp(8), dp(8), dp(8));
        card.setBackgroundColor(Color.WHITE);
        Button play = new Button(this);
        play.setText("播放");
        play.setOnClickListener(v -> toggleAudio(item, play));
        card.addView(play, new LinearLayout.LayoutParams(dp(78), dp(46)));
        LinearLayout info = column();
        info.setPadding(dp(10), 0, dp(6), 0);
        TextView type = text("音频 " + (index + 1), 13, Color.DKGRAY);
        type.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        info.addView(type, matchWrap());
        TextView name = text(item.name + "\n" + String.format(Locale.US, "%.2f MB", item.size / 1024.0 / 1024.0), 12, Color.GRAY);
        name.setMaxLines(2);
        name.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        info.addView(name, matchWrap());
        card.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button remove = new Button(this);
        remove.setText("移除");
        remove.setOnClickListener(v -> { audios.remove(item); refreshMediaView(); });
        card.addView(remove, wrapParams());
        return card;
    }

    private void toggleAudio(MediaItem item, Button button) {
        try {
            if (mediaPlayer != null && activeAudioButton == button && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
                button.setText("播放");
                return;
            }
            stopAudio();
            mediaPlayer = MediaPlayer.create(this, item.uri);
            if (mediaPlayer == null) throw new IOException("无法播放该音频");
            activeAudioButton = button;
            button.setText("暂停");
            mediaPlayer.setOnCompletionListener(mp -> { button.setText("播放"); stopAudio(); });
            mediaPlayer.start();
        } catch (Exception e) {
            toast("音频预览失败：" + e.getMessage());
            stopAudio();
        }
    }

    private void stopAudio() {
        if (mediaPlayer != null) {
            try { mediaPlayer.stop(); } catch (Exception ignored) {}
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (activeAudioButton != null) activeAudioButton.setText("播放");
        activeAudioButton = null;
    }

    private void submitTask() {
        final String token = tokenInput.getText().toString().trim();
        final String prompt = promptInput.getText().toString().trim();
        if (token.isEmpty()) { toast("请先到“设置”中保存 Token"); showTab(3); return; }
        if (prompt.isEmpty()) { toast("Prompt 不能为空"); return; }
        final int duration;
        try { duration = Integer.parseInt(durationInput.getText().toString().trim()); }
        catch (Exception e) { toast("时长请输入 1-15 的整数"); return; }
        if (duration < 1 || duration > 15) { toast("时长范围是 1-15 秒"); return; }
        final String seedText = seedInput.getText().toString().trim();
        if (!seedText.isEmpty()) {
            try {
                long seed = Long.parseLong(seedText);
                if (seed < 1 || seed > 999999999999999L) throw new NumberFormatException();
            } catch (Exception e) { toast("Seed 范围是 1-999999999999999"); return; }
        }
        JSONObject body = new JSONObject();
        try {
            body.put("prompt", prompt);
            body.put("duration", duration);
            body.put("resolution", resolutionInput.getSelectedItem().toString());
            if (!seedText.isEmpty()) body.put("seed", Long.parseLong(seedText));
            for (int i = 0; i < images.size(); i++) body.put("ref_image_" + i, images.get(i).dataUri);
            for (int i = 0; i < audios.size(); i++) body.put("ref_audio_" + i, audios.get(i).dataUri);
        } catch (JSONException e) { toast("参数构造失败：" + e.getMessage()); return; }

        submitButton.setEnabled(false);
        submitProgress.setVisibility(View.VISIBLE);
        final String requestBody = body.toString();
        executor.execute(() -> {
            try {
                String response = ApiClient.post(API_ROOT + WORKFLOW_ID, token, requestBody);
                JSONObject json = new JSONObject(response);
                if (!"Success".equalsIgnoreCase(json.optString("code"))) throw new IOException(apiError(json, "任务提交失败"));
                JSONObject data = json.getJSONObject("data");
                TaskItem task = new TaskItem(data.getString("task_id"), data.optString("status", "QUEUED"), System.currentTimeMillis());
                runOnUiThread(() -> {
                    tasks.add(0, task);
                    saveTasks();
                    refreshAllViews();
                    toast("任务提交成功");
                    submitButton.setEnabled(true);
                    submitProgress.setVisibility(View.GONE);
                    showTab(1);
                    pollTasks();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    toast(e.getMessage() == null ? "任务提交失败" : e.getMessage());
                    submitButton.setEnabled(true);
                    submitProgress.setVisibility(View.GONE);
                });
            }
        });
    }

    private void pollTasks() {
        final String token = tokenInput == null ? "" : tokenInput.getText().toString().trim();
        if (token.isEmpty() || pollInFlight || tasks.isEmpty()) return;
        boolean pending = false;
        for (TaskItem task : tasks) if (!task.isTerminal()) pending = true;
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
                    String status = data.optString("status", task.status);
                    String resultUrl = extractVideoUrl(data.optJSONArray("results"));
                    runOnUiThread(() -> {
                        task.status = status;
                        if (!resultUrl.isEmpty()) task.videoUrl = resultUrl;
                        task.updatedAt = System.currentTimeMillis();
                        if ("SUCCESS".equalsIgnoreCase(status) && !task.videoUrl.isEmpty()) startDownloadIfNeeded(task);
                        saveTasks();
                        refreshAllViews();
                    });
                } catch (Exception ignored) {}
            }
            runOnUiThread(() -> {
                pollInFlight = false;
                boolean stillPending = false;
                for (TaskItem task : tasks) if (!task.isTerminal()) stillPending = true;
                if (stillPending) handler.postDelayed(pollRunnable, 5000);
            });
        });
    }

    private void startDownloadIfNeeded(TaskItem task) {
        if (task.videoUrl.isEmpty() || !task.localUri.isEmpty() || task.downloadId > 0) return;
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
        if (downloadId < 0) return;
        TaskItem target = null;
        for (TaskItem task : tasks) if (task.downloadId == downloadId) { target = task; break; }
        if (target == null) return;
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor != null && cursor.moveToFirst()) {
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    target.localUri = uriColumn >= 0 ? cursor.getString(uriColumn) : "";
                    target.downloadState = "已下载";
                } else target.downloadState = "下载失败";
                saveTasks();
                refreshAllViews();
            }
        } catch (Exception e) {
            target.downloadState = "下载状态未知";
            saveTasks();
            refreshAllViews();
        }
    }

    private boolean reconcileDownloads() {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        boolean changed = false;
        boolean pending = false;
        for (TaskItem task : tasks) {
            // Recover tasks created by an earlier build where the result URL was saved but
            // enqueue() had not happened yet (for example, if the app was backgrounded).
            if (task.downloadId <= 0 && task.localUri.isEmpty()
                    && "SUCCESS".equalsIgnoreCase(task.status) && !task.videoUrl.isEmpty()
                    && !task.downloadState.startsWith("下载失败")) {
                startDownloadIfNeeded(task);
                changed = true;
            }
            if (task.downloadId <= 0 || !task.localUri.isEmpty()) continue;
            try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(task.downloadId))) {
                if (cursor == null || !cursor.moveToFirst()) {
                    // Keep polling an ID that DownloadManager has not exposed yet.
                    pending = true;
                    continue;
                }
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    String localUri = uriColumn >= 0 ? cursor.getString(uriColumn) : "";
                    if (!localUri.isEmpty()) {
                        task.localUri = localUri;
                        task.downloadState = "已下载";
                    } else {
                        task.downloadState = "下载状态未知";
                        pending = true;
                    }
                    changed = true;
                } else if (status == DownloadManager.STATUS_FAILED) {
                    task.downloadState = "下载失败";
                    changed = true;
                } else {
                    // PENDING, RUNNING and PAUSED all mean the file is still being handled.
                    if (!"下载中".equals(task.downloadState)) {
                        task.downloadState = "下载中";
                        changed = true;
                    }
                    pending = true;
                }
            } catch (Exception ignored) {
                pending = true;
            }
        }
        if (changed) saveTasks();
        return pending;
    }

    private boolean hasPendingDownloads() {
        for (TaskItem task : tasks) {
            if (task.downloadId > 0 && task.localUri.isEmpty()
                    && !task.downloadState.startsWith("下载失败")) return true;
        }
        return false;
    }

    private String extractVideoUrl(JSONArray results) {
        if (results == null) return "";
        String first = "";
        for (int i = 0; i < results.length(); i++) {
            JSONObject result = results.optJSONObject(i);
            if (result == null) continue;
            String url = result.optString("url", "");
            if (url.isEmpty()) continue;
            if (first.isEmpty()) first = url;
            if ("video".equalsIgnoreCase(result.optString("type"))) return url;
        }
        return first;
    }

    private void refreshAllViews() {
        handler.removeCallbacks(downloadPollRunnable);
        reconcileDownloads();
        refreshMediaView();
        refreshTaskViews();
        refreshResultViews();
        if (hasPendingDownloads()) handler.postDelayed(downloadPollRunnable, 1000);
    }

    private void refreshTaskViews() {
        if (tasksContainer == null) return;
        tasksContainer.removeAllViews();
        if (tasks.isEmpty()) {
            tasksContainer.addView(text("暂无任务，先去“生成”页提交一个吧。", 13, Color.GRAY), matchWrap());
            return;
        }
        for (TaskItem task : tasks) {
            LinearLayout card = card();
            TextView id = text("任务 " + task.id, 13, Color.DKGRAY);
            id.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            card.addView(id, matchWrap());
            String time = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.CHINA).format(new Date(task.createdAt));
            card.addView(text(statusText(task.status) + "  ·  " + time, 14, statusColor(task.status)), matchWrapWithBottom(2));
            if (!task.downloadState.isEmpty()) card.addView(text("视频：" + task.downloadState, 12, Color.GRAY), matchWrap());
            tasksContainer.addView(card, matchWrapWithBottom(8));
        }
    }

    private void refreshResultViews() {
        if (resultsContainer == null) return;
        resultsContainer.removeAllViews();
        boolean any = false;
        for (TaskItem task : tasks) {
            if (!"SUCCESS".equalsIgnoreCase(task.status)) continue;
            any = true;
            LinearLayout card = card();
            TextView title = text("任务 " + task.id, 13, Color.DKGRAY);
            title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            card.addView(title, matchWrap());
            String source = !task.localUri.isEmpty() ? task.localUri : task.videoUrl;
            if (!source.isEmpty()) {
                card.addView(createVideoPreview(source), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)));
                Button fullscreen = new Button(this);
                fullscreen.setText("全屏播放");
                fullscreen.setOnClickListener(v -> playFullscreen(source));
                card.addView(fullscreen, wrapParams());
            } else card.addView(text("正在等待视频下载链接…", 13, Color.GRAY), matchWrap());
            card.addView(text(task.downloadState.isEmpty() ? "视频已生成，正在准备下载" : task.downloadState, 12, Color.GRAY), matchWrapWithBottom(3));
            if (task.localUri.isEmpty() && !task.videoUrl.isEmpty() && task.downloadId == 0) {
                Button retry = new Button(this);
                retry.setText("重新下载");
                retry.setOnClickListener(v -> { startDownloadIfNeeded(task); saveTasks(); refreshAllViews(); });
                card.addView(retry, wrapParams());
            }
            resultsContainer.addView(card, matchWrapWithBottom(10));
        }
        if (!any) resultsContainer.addView(text("暂无已完成结果。完成的视频会自动出现在这里。", 13, Color.GRAY), matchWrap());
    }

    private FrameLayout createVideoPreview(String source) {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.BLACK);

        VideoView video = new VideoView(this);
        video.setMediaController(new MediaController(this));
        ImageView cover = new ImageView(this);
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        cover.setBackgroundColor(Color.BLACK);
        cover.setTag(Boolean.FALSE);

        video.setVideoURI(Uri.parse(source));
        video.setOnPreparedListener(mp -> {
            // Force the first decoded frame onto the surface. A plain setVideoURI() often
            // leaves a black surface until the user presses play on ColorOS/Android 16.
            video.seekTo(100);
            video.start();
            video.postDelayed(() -> {
                if (video.isPlaying()) video.pause();
                cover.setTag(Boolean.TRUE);
                cover.setVisibility(View.GONE);
            }, 250);
        });
        video.setOnErrorListener((mp, what, extra) -> {
            cover.setTag(Boolean.FALSE);
            cover.setVisibility(View.VISIBLE);
            return false;
        });
        cover.setOnClickListener(v -> {
            cover.setVisibility(View.GONE);
            video.start();
        });

        frame.addView(video, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        frame.addView(cover, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loadVideoCover(source, cover);
        return frame;
    }

    private void loadVideoCover(String source, ImageView cover) {
        // The result is normally a local file by the time it appears here. Retrieving one
        // frame gives the user an actual cover instead of a black placeholder while the
        // VideoView is preparing. Remote URLs are left to VideoView's prepared callback.
        Uri sourceUri = Uri.parse(source);
        String scheme = sourceUri.getScheme();
        if (!"file".equalsIgnoreCase(scheme) && !"content".equalsIgnoreCase(scheme)) return;
        executor.execute(() -> {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            Bitmap bitmap = null;
            try {
                retriever.setDataSource(this, sourceUri);
                bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            } catch (Exception ignored) {
            } finally {
                try { retriever.release(); } catch (Exception ignored) {}
            }
            if (bitmap != null) {
                Bitmap frameBitmap = bitmap;
                runOnUiThread(() -> {
                    if (!Boolean.TRUE.equals(cover.getTag())) {
                        cover.setImageBitmap(frameBitmap);
                        cover.setVisibility(View.VISIBLE);
                    }
                });
            }
        });
    }

    private void playFullscreen(String source) {
        Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.BLACK);
        VideoView video = new VideoView(this);
        video.setMediaController(new MediaController(this));
        video.setVideoURI(Uri.parse(source));
        video.setOnPreparedListener(mp -> video.start());
        frame.addView(video, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        Button close = new Button(this);
        close.setText("关闭");
        close.setOnClickListener(v -> dialog.dismiss());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dp(80), dp(48), Gravity.TOP | Gravity.RIGHT);
        closeParams.topMargin = dp(16);
        closeParams.rightMargin = dp(8);
        frame.addView(close, closeParams);

        dialog.setContentView(frame);
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private LinearLayout card() {
        LinearLayout card = column();
        card.setPadding(dp(12), dp(10), dp(12), dp(10));
        android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(10));
        card.setBackground(background);
        return card;
    }

    private String statusText(String status) {
        if (status == null) return "未知";
        switch (status.toUpperCase(Locale.US)) {
            case "QUEUED": return "排队中";
            case "RUNNING": return "执行中";
            case "SUCCESS": return "已完成";
            case "FAILED": return "失败";
            case "CANCELLED": return "已取消";
            default: return status;
        }
    }

    private int statusColor(String status) {
        if ("SUCCESS".equalsIgnoreCase(status)) return Color.rgb(22, 125, 67);
        if ("FAILED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status)) return Color.rgb(190, 60, 55);
        return Color.rgb(70, 80, 150);
    }

    private String apiError(JSONObject json, String fallback) {
        String msg = json.optString("msg", "");
        JSONObject error = json.optJSONObject("error");
        if (error != null && !error.optString("message", "").isEmpty()) msg = error.optString("message");
        return msg.isEmpty() ? fallback : msg;
    }

    private boolean isAcceptedMime(String mime, int kind) {
        if (mime == null) return false;
        String lower = mime.toLowerCase(Locale.US);
        if (kind == 0) return lower.equals("image/jpeg") || lower.equals("image/jpg") || lower.equals("image/png") || lower.equals("image/webp");
        return lower.equals("audio/mpeg") || lower.equals("audio/mp3") || lower.equals("audio/wav") || lower.equals("audio/x-wav") || lower.equals("audio/mp4") || lower.equals("audio/flac") || lower.equals("audio/x-flac");
    }

    private byte[] readBytes(Uri uri, long maxBytes) throws IOException {
        try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("无法读取所选文件");
            byte[] buffer = new byte[16 * 1024];
            int read;
            long total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IOException("单个文件超过 50 MB");
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
        return path == null ? "已选择文件" : path.substring(path.lastIndexOf('/') + 1);
    }

    private long selectedBytes() {
        long total = 0;
        for (MediaItem item : images) total += item.size;
        for (MediaItem item : audios) total += item.size;
        return total;
    }

    private void loadTasks() {
        tasks.clear();
        try {
            JSONArray array = new JSONArray(prefs().getString(TASKS_KEY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.getJSONObject(i);
                TaskItem task = new TaskItem(object.optString("id"), object.optString("status", "QUEUED"), object.optLong("createdAt", System.currentTimeMillis()));
                task.videoUrl = object.optString("videoUrl", "");
                task.localUri = object.optString("localUri", "");
                task.downloadId = object.optLong("downloadId", 0);
                task.downloadState = object.optString("downloadState", "");
                tasks.add(task);
            }
        } catch (Exception ignored) {}
    }

    private void saveTasks() {
        JSONArray array = new JSONArray();
        try {
            int limit = Math.min(tasks.size(), 30);
            for (int i = 0; i < limit; i++) {
                TaskItem task = tasks.get(i);
                JSONObject object = new JSONObject();
                object.put("id", task.id);
                object.put("status", task.status);
                object.put("createdAt", task.createdAt);
                object.put("videoUrl", task.videoUrl);
                object.put("localUri", task.localUri);
                object.put("downloadId", task.downloadId);
                object.put("downloadState", task.downloadState);
                array.put(object);
            }
        } catch (JSONException ignored) {}
        prefs().edit().putString(TASKS_KEY, array.toString()).apply();
    }

    private String readTokenSecure() {
        try {
            String cipherText = prefs().getString(TOKEN_CIPHER_KEY, "");
            String ivText = prefs().getString(TOKEN_IV_KEY, "");
            if (cipherText.isEmpty() || ivText.isEmpty()) return "";
            SecretKey key = getTokenKey(false);
            if (key == null) return "";
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(ivText, Base64.DEFAULT)));
            return new String(cipher.doFinal(Base64.decode(cipherText, Base64.DEFAULT)), StandardCharsets.UTF_8);
        } catch (Exception ignored) { return ""; }
    }

    private boolean saveTokenSecure(String token) {
        try {
            if (token.isEmpty()) {
                prefs().edit().remove(TOKEN_CIPHER_KEY).remove(TOKEN_IV_KEY).apply();
                return true;
            }
            SecretKey key = getTokenKey(true);
            if (key == null) return false;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            prefs().edit()
                    .putString(TOKEN_CIPHER_KEY, Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP))
                    .putString(TOKEN_IV_KEY, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
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

    @Override protected void onResume() {
        super.onResume();
        if (tokenInput != null) {
            refreshAllViews();
            pollTasks();
        }
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(pollRunnable);
        handler.removeCallbacks(downloadPollRunnable);
        stopAudio();
        try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
        executor.shutdownNow();
        super.onDestroy();
    }

    private LinearLayout column() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); return layout; }
    private LinearLayout row() { LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.HORIZONTAL); layout.setGravity(Gravity.CENTER_VERTICAL); return layout; }
    private TextView sectionTitle(String value) { TextView view = text(value, 17, Color.rgb(35, 40, 55)); view.setTypeface(Typeface.DEFAULT, Typeface.BOLD); view.setPadding(0, dp(8), 0, dp(8)); return view; }
    private TextView text(String value, int sizeSp, int color) { TextView view = new TextView(this); view.setText(value); view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp); view.setTextColor(color); return view; }
    private EditText edit(String hint, boolean multiline) { EditText edit = new EditText(this); edit.setHint(hint); edit.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); edit.setPadding(dp(10), dp(6), dp(10), dp(6)); if (multiline) edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE); return edit; }
    private LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    private LinearLayout.LayoutParams matchWrapWithBottom(int bottomDp) { LinearLayout.LayoutParams params = matchWrap(); params.bottomMargin = dp(bottomDp); return params; }
    private LinearLayout.LayoutParams wrapParams() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
    private LinearLayout.LayoutParams weightParams(float weight, int rightDp) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), weight); params.rightMargin = dp(rightDp); return params; }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }

    private static final class MediaItem {
        final int kind; final Uri uri; final String name; final String mime; final long size; final String dataUri;
        MediaItem(int kind, Uri uri, String name, String mime, long size, String dataUri) { this.kind = kind; this.uri = uri; this.name = name; this.mime = mime; this.size = size; this.dataUri = dataUri; }
    }

    private static final class TaskItem {
        final String id; String status; final long createdAt; long updatedAt; String videoUrl = ""; String localUri = ""; long downloadId = 0; String downloadState = "";
        TaskItem(String id, String status, long createdAt) { this.id = id; this.status = status; this.createdAt = createdAt; this.updatedAt = createdAt; }
        boolean isTerminal() { return "SUCCESS".equalsIgnoreCase(status) || "FAILED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status); }
    }

    private static final class ApiClient {
        private ApiClient() {}
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
