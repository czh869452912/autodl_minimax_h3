package com.example.autodlh3;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Small, dependency-free Android client for AutoDL.Art's ComfyUI API.
 * The API accepts image/audio values as data URLs, so the Android document
 * picker can be used without an extra upload service.
 */
public class MainActivity extends Activity {
    private static final String WORKFLOW_ID = "minimax_h3_image_audio_to_video_v2_15s";
    private static final String API_ROOT = "https://autodl.art/api/v1/comfyui/comfyui_workflow/";
    private static final int PICK_FILE_REQUEST = 401;
    private static final long MAX_TOTAL_UPLOAD_BYTES = 50L * 1024L * 1024L;

    private EditText tokenInput;
    private EditText promptInput;
    private EditText durationInput;
    private EditText seedInput;
    private Spinner resolutionInput;
    private Button submitButton;
    private ProgressBar submitProgress;
    private LinearLayout tasksContainer;
    private TextView uploadSummary;

    private final String[] imageData = new String[9];
    private final String[] imageNames = new String[9];
    private final long[] imageSizes = new long[9];
    private final String[] audioData = new String[3];
    private final String[] audioNames = new String[3];
    private final long[] audioSizes = new long[3];
    private final ArrayList<TaskItem> tasks = new ArrayList<>();

    private int pendingKind = 0;
    private int pendingIndex = 0;
    private boolean pollInFlight = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newCachedThreadPool();

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            pollTasks();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // getSharedPreferences cannot be called before attach; this assignment
        // is kept in onCreate rather than relying on the constructor.
        buildUi();
        loadTasks();
        refreshTaskViews();
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences("autodl_h3", MODE_PRIVATE);
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(247, 248, 252));
        LinearLayout root = column();
        root.setPadding(dp(18), dp(18), dp(18), dp(28));
        scroll.addView(root);

        TextView title = text("AutoDL H3 视频生成", 24, Color.rgb(25, 28, 38));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(title, matchWrap());
        TextView subtitle = text("多图 + 多音频参考生视频（最长 15 秒）", 14, Color.DKGRAY);
        subtitle.setPadding(0, dp(4), 0, dp(14));
        root.addView(subtitle, matchWrap());

        root.addView(sectionTitle("连接配置"), matchWrap());
        tokenInput = edit("AutoDL ComfyUI Token（不会写入 APK）", false);
        tokenInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(tokenInput, matchWrapWithBottom(10));
        TextView tokenHint = text("请在 AutoDL.Art → 令牌管理中创建 ComfyUI 分组令牌。请求会直接从手机发送到 AutoDL。", 12, Color.GRAY);
        tokenHint.setPadding(0, 0, 0, dp(12));
        root.addView(tokenHint, matchWrap());

        root.addView(sectionTitle("生成参数"), matchWrap());
        promptInput = edit("Prompt：描述主体、动作、场景和镜头运动", true);
        promptInput.setMinLines(4);
        promptInput.setGravity(Gravity.TOP | Gravity.START);
        root.addView(promptInput, matchWrapWithBottom(10));

        LinearLayout parameterRow = row();
        durationInput = edit("时长（1-15秒）", false);
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
        parameterRow.addView(resolutionInput, weightParams(1.2f, 0));
        root.addView(parameterRow, matchWrapWithBottom(14));

        root.addView(sectionTitle("参考图片（最多 9 张，可选）"), matchWrap());
        LinearLayout imageContainer = column();
        for (int i = 0; i < imageData.length; i++) {
            imageContainer.addView(createMediaRow(0, i), matchWrapWithBottom(6));
        }
        root.addView(imageContainer, matchWrapWithBottom(10));

        root.addView(sectionTitle("参考音频（最多 3 段，可选）"), matchWrap());
        LinearLayout audioContainer = column();
        for (int i = 0; i < audioData.length; i++) {
            audioContainer.addView(createMediaRow(1, i), matchWrapWithBottom(6));
        }
        root.addView(audioContainer, matchWrapWithBottom(6));
        uploadSummary = text("已选择文件：0 B", 12, Color.GRAY);
        root.addView(uploadSummary, matchWrapWithBottom(14));

        LinearLayout submitRow = row();
        submitButton = new Button(this);
        submitButton.setText("提交生成任务");
        submitButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        submitButton.setOnClickListener(v -> submitTask());
        submitRow.addView(submitButton, weightParams(1, 8));
        submitProgress = new ProgressBar(this);
        submitProgress.setVisibility(View.GONE);
        submitRow.addView(submitProgress, new LinearLayout.LayoutParams(dp(40), dp(40)));
        root.addView(submitRow, matchWrapWithBottom(20));

        LinearLayout taskHeader = row();
        TextView taskTitle = sectionTitle("本机任务队列");
        taskHeader.addView(taskTitle, weightParams(1, 0));
        Button refresh = new Button(this);
        refresh.setText("刷新状态");
        refresh.setOnClickListener(v -> pollTasks());
        taskHeader.addView(refresh, wrapParams());
        root.addView(taskHeader, matchWrap());
        TextView queueHint = text("任务状态来自 AutoDL 查询接口；成功后的资源链接有效期较短，请及时下载。", 12, Color.GRAY);
        queueHint.setPadding(0, dp(2), 0, dp(8));
        root.addView(queueHint, matchWrap());
        tasksContainer = column();
        root.addView(tasksContainer, matchWrap());

        setContentView(scroll);
    }

    private LinearLayout createMediaRow(final int kind, final int index) {
        LinearLayout container = row();
        TextView label = text((kind == 0 ? "图片 " : "音频 ") + (index + 1), 14, Color.DKGRAY);
        container.addView(label, new LinearLayout.LayoutParams(dp(58), dp(46)));
        Button pick = new Button(this);
        pick.setText("选择文件");
        pick.setOnClickListener(v -> pickMedia(kind, index));
        container.addView(pick, new LinearLayout.LayoutParams(dp(104), dp(46)));
        TextView name = text("未选择", 12, Color.GRAY);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        name.setTag(mediaNameTag(kind, index));
        container.addView(name, weightParams(1, 4));
        return container;
    }

    private String mediaNameTag(int kind, int index) {
        return "media-name-" + kind + "-" + index;
    }

    private void pickMedia(int kind, int index) {
        pendingKind = kind;
        pendingIndex = index;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(kind == 0 ? "image/*" : "audio/*");
        startActivityForResult(intent, PICK_FILE_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        Uri uri = data.getData();
        final int selectedKind = pendingKind;
        final int selectedIndex = pendingIndex;
        executor.execute(() -> {
            try {
                String mime = getContentResolver().getType(uri);
                if (!isAcceptedMime(mime, selectedKind)) {
                    throw new IOException("不支持的文件类型：" + (mime == null ? "未知" : mime));
                }
                byte[] bytes = readBytes(uri, MAX_TOTAL_UPLOAD_BYTES);
                long current = selectedBytes() - selectedSize(selectedKind, selectedIndex);
                if (current + bytes.length > MAX_TOTAL_UPLOAD_BYTES) {
                    throw new IOException("所有上传文件大小总和不能超过 50 MB");
                }
                String safeMime = mime == null ? (selectedKind == 0 ? "image/png" : "audio/mpeg") : mime;
                String encoded = "data:" + safeMime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
                String displayName = queryDisplayName(uri);
                runOnUiThread(() -> {
                    if (selectedKind == 0) {
                        imageData[selectedIndex] = encoded;
                        imageNames[selectedIndex] = displayName;
                        imageSizes[selectedIndex] = bytes.length;
                    } else {
                        audioData[selectedIndex] = encoded;
                        audioNames[selectedIndex] = displayName;
                        audioSizes[selectedIndex] = bytes.length;
                    }
                    updateMediaLabel(selectedKind, selectedIndex, displayName);
                    updateUploadSummary();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private boolean isAcceptedMime(String mime, int kind) {
        if (mime == null) return false;
        String lower = mime.toLowerCase(Locale.US);
        if (kind == 0) {
            return lower.equals("image/jpeg") || lower.equals("image/jpg") ||
                    lower.equals("image/png") || lower.equals("image/webp");
        }
        return lower.equals("audio/mpeg") || lower.equals("audio/mp3") ||
                lower.equals("audio/wav") || lower.equals("audio/x-wav") ||
                lower.equals("audio/mp4") || lower.equals("audio/flac") ||
                lower.equals("audio/x-flac");
    }

    private byte[] readBytes(Uri uri, long maxBytes) throws IOException {
        ContentResolver resolver = getContentResolver();
        try (InputStream input = resolver.openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("无法读取所选文件");
            byte[] buffer = new byte[16 * 1024];
            int read;
            long total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IOException("单次选择后上传总量不能超过 50 MB");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) return cursor.getString(0);
            } finally {
                cursor.close();
            }
        }
        String path = uri.getPath();
        return path == null ? "已选择文件" : path.substring(path.lastIndexOf('/') + 1);
    }

    private void updateMediaLabel(int kind, int index, String name) {
        if (tasksContainer == null) return;
        View root = findViewById(android.R.id.content);
        // Labels are looked up by tag from the content tree, avoiding a second
        // parallel array of view references.
        TextView label = findTextView(root, mediaNameTag(kind, index));
        if (label != null) label.setText(name == null ? "已选择文件" : name);
    }

    private TextView findTextView(View view, String tag) {
        if (view instanceof TextView && tag.equals(view.getTag())) return (TextView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                TextView found = findTextView(group.getChildAt(i), tag);
                if (found != null) return found;
            }
        }
        return null;
    }

    private long selectedSize(int kind, int index) {
        return kind == 0 ? imageSizes[index] : audioSizes[index];
    }

    private long selectedBytes() {
        long total = 0;
        for (long size : imageSizes) total += size;
        for (long size : audioSizes) total += size;
        return total;
    }

    private void updateUploadSummary() {
        if (uploadSummary != null) uploadSummary.setText(String.format(Locale.US, "已选择文件：%.2f MB", selectedBytes() / 1024.0 / 1024.0));
    }

    private void submitTask() {
        final String token = tokenInput.getText().toString().trim();
        final String prompt = promptInput.getText().toString().trim();
        if (token.isEmpty()) {
            toast("请先输入 AutoDL ComfyUI Token");
            return;
        }
        if (prompt.isEmpty()) {
            toast("Prompt 不能为空");
            return;
        }
        final int duration;
        try {
            duration = Integer.parseInt(durationInput.getText().toString().trim());
        } catch (Exception e) {
            toast("时长请输入 1-15 的整数");
            return;
        }
        if (duration < 1 || duration > 15) {
            toast("时长范围是 1-15 秒");
            return;
        }
        final String seedText = seedInput.getText().toString().trim();
        if (!seedText.isEmpty()) {
            try {
                long seed = Long.parseLong(seedText);
                if (seed < 1 || seed > 999999999999999L) throw new NumberFormatException();
            } catch (Exception e) {
                toast("Seed 范围是 1-999999999999999");
                return;
            }
        }

        JSONObject body = new JSONObject();
        try {
            body.put("prompt", prompt);
            body.put("duration", duration);
            body.put("resolution", resolutionInput.getSelectedItem().toString());
            if (!seedText.isEmpty()) body.put("seed", Long.parseLong(seedText));
            for (int i = 0; i < imageData.length; i++) if (imageData[i] != null) body.put("ref_image_" + i, imageData[i]);
            for (int i = 0; i < audioData.length; i++) if (audioData[i] != null) body.put("ref_audio_" + i, audioData[i]);
        } catch (JSONException e) {
            toast("参数构造失败：" + e.getMessage());
            return;
        }

        submitButton.setEnabled(false);
        submitProgress.setVisibility(View.VISIBLE);
        final String requestBody = body.toString();
        executor.execute(() -> {
            try {
                String response = ApiClient.post(API_ROOT + WORKFLOW_ID, token, requestBody);
                JSONObject json = new JSONObject(response);
                if (!"Success".equalsIgnoreCase(json.optString("code"))) {
                    throw new IOException(apiError(json, "任务提交失败"));
                }
                JSONObject data = json.getJSONObject("data");
                String taskId = data.getString("task_id");
                TaskItem task = new TaskItem(taskId, data.optString("status", "QUEUED"), System.currentTimeMillis(), "");
                runOnUiThread(() -> {
                    tasks.add(0, task);
                    saveTasks();
                    refreshTaskViews();
                    toast("任务提交成功：" + taskId);
                    submitButton.setEnabled(true);
                    submitProgress.setVisibility(View.GONE);
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
        boolean hasPending = false;
        for (TaskItem task : tasks) if (!task.isTerminal()) hasPending = true;
        if (!hasPending) return;
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
                    String videoUrl = extractVideoUrl(data.optJSONArray("results"));
                    runOnUiThread(() -> {
                        task.status = status;
                        if (!videoUrl.isEmpty()) task.videoUrl = videoUrl;
                        task.updatedAt = System.currentTimeMillis();
                        saveTasks();
                        refreshTaskViews();
                    });
                } catch (Exception ignored) {
                    // Keep the last known state; a later refresh will retry.
                }
            }
            runOnUiThread(() -> {
                pollInFlight = false;
                boolean pending = false;
                for (TaskItem task : tasks) if (!task.isTerminal()) pending = true;
                if (pending) handler.postDelayed(pollRunnable, 5000);
            });
        });
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

    private void refreshTaskViews() {
        if (tasksContainer == null) return;
        tasksContainer.removeAllViews();
        if (tasks.isEmpty()) {
            TextView empty = text("暂无任务。提交后会在这里显示排队和执行状态。", 13, Color.GRAY);
            tasksContainer.addView(empty, matchWrapWithBottom(8));
            return;
        }
        for (TaskItem task : tasks) {
            LinearLayout card = column();
            card.setPadding(dp(12), dp(10), dp(12), dp(10));
            android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
            background.setColor(Color.WHITE);
            background.setCornerRadius(dp(10));
            card.setBackground(background);

            TextView id = text("任务 " + task.id, 13, Color.DKGRAY);
            id.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            card.addView(id, matchWrap());
            String time = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.CHINA).format(new Date(task.createdAt));
            TextView status = text(statusText(task.status) + "  ·  " + time, 14, statusColor(task.status));
            status.setPadding(0, dp(4), 0, dp(4));
            card.addView(status, matchWrap());
            if ("SUCCESS".equalsIgnoreCase(task.status) && !task.videoUrl.isEmpty()) {
                Button download = new Button(this);
                download.setText("下载生成视频");
                download.setOnClickListener(v -> downloadVideo(task));
                card.addView(download, wrapParams());
            } else if ("FAILED".equalsIgnoreCase(task.status) || "CANCELLED".equalsIgnoreCase(task.status)) {
                TextView failure = text("任务未成功完成，可检查 Token、参数和账户余额后重新提交。", 12, Color.GRAY);
                card.addView(failure, matchWrap());
            }
            LinearLayout.LayoutParams cardParams = matchWrapWithBottom(8);
            tasksContainer.addView(card, cardParams);
        }
    }

    private void downloadVideo(TaskItem task) {
        try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(task.videoUrl));
            request.setTitle("AutoDL H3 视频");
            request.setDescription("任务 " + task.id);
            request.setMimeType("video/mp4");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MOVIES, "AutoDL-H3/" + task.id + ".mp4");
            manager.enqueue(request);
            toast("已加入下载，完成后保存在 Movies/AutoDL-H3");
        } catch (Exception e) {
            toast("下载失败：" + e.getMessage());
        }
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

    private void loadTasks() {
        tasks.clear();
        String raw = prefs().getString("tasks", "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.getJSONObject(i);
                tasks.add(new TaskItem(object.optString("id"), object.optString("status", "QUEUED"),
                        object.optLong("createdAt", System.currentTimeMillis()), object.optString("videoUrl", "")));
            }
        } catch (Exception ignored) {
            // Ignore corrupted local history and start with an empty queue.
        }
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
                array.put(object);
            }
        } catch (JSONException ignored) {
        }
        prefs().edit().putString("tasks", array.toString()).apply();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (tokenInput != null) pollTasks();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(pollRunnable);
        executor.shutdownNow();
        super.onDestroy();
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private TextView sectionTitle(String value) {
        TextView view = text(value, 17, Color.rgb(35, 40, 55));
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setPadding(0, dp(8), 0, dp(8));
        return view;
    }

    private TextView text(String value, int sizeSp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(color);
        return view;
    }

    private EditText edit(String hint, boolean multiline) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        edit.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        edit.setPadding(dp(10), dp(6), dp(10), dp(6));
        if (multiline) edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        return edit;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams matchWrapWithBottom(int bottomDp) {
        LinearLayout.LayoutParams params = matchWrap();
        params.bottomMargin = dp(bottomDp);
        return params;
    }

    private LinearLayout.LayoutParams wrapParams() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams weightParams(float weight, int rightDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), weight);
        params.rightMargin = dp(rightDp);
        return params;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private static final class TaskItem {
        final String id;
        String status;
        final long createdAt;
        long updatedAt;
        String videoUrl;

        TaskItem(String id, String status, long createdAt, String videoUrl) {
            this.id = id;
            this.status = status;
            this.createdAt = createdAt;
            this.updatedAt = createdAt;
            this.videoUrl = videoUrl;
        }

        boolean isTerminal() {
            return "SUCCESS".equalsIgnoreCase(status) || "FAILED".equalsIgnoreCase(status) ||
                    "CANCELLED".equalsIgnoreCase(status);
        }
    }

    private static final class ApiClient {
        private ApiClient() {}

        static String post(String endpoint, String token, String body) throws IOException {
            return request("POST", endpoint, token, body);
        }

        static String get(String endpoint, String token) throws IOException {
            return request("GET", endpoint, token, null);
        }

        private static String request(String method, String endpoint, String token, String body) throws IOException {
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(120_000);
            connection.setDoInput(true);
            connection.setRequestProperty("Authorization", token);
            connection.setRequestProperty("Content-Type", "application/json");
            if (body != null) {
                connection.setDoOutput(true);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                connection.getOutputStream().write(bytes);
            }
            int code = connection.getResponseCode();
            InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String response = stream == null ? "" : readText(stream);
            if (code < 200 || code >= 300) {
                throw new IOException("HTTP " + code + (response.isEmpty() ? "" : "：" + response));
            }
            return response;
        }

        private static String readText(InputStream stream) throws IOException {
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return output.toString(StandardCharsets.UTF_8.name());
            }
        }
    }
}
