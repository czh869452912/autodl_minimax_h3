package com.example.autodlh3;

import android.webkit.JavascriptInterface;

public class NativeBridge {
    private final MainActivity activity;

    public NativeBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean saveToken(String token) {
        return activity.saveTokenSecure(token);
    }

    @JavascriptInterface
    public String readToken() {
        return activity.readTokenSecure();
    }

    @JavascriptInterface
    public boolean saveLlmConfig(String apiKey, String endpoint) {
        return activity.saveLlmConfigSecure(apiKey, endpoint);
    }

    @JavascriptInterface
    public String readLlmApiKey() {
        return activity.readLlmApiKeySecure();
    }

    @JavascriptInterface
    public String readLlmEndpoint() {
        return activity.readLlmEndpointSecure();
    }

    @JavascriptInterface
    public boolean submitTask(String taskJson) {
        activity.submitTaskFromWeb(taskJson);
        return true;
    }

    @JavascriptInterface
    public String loadTasks() {
        return activity.getTasksJson();
    }

    @JavascriptInterface
    public void saveTasks(String tasksJson) {
        activity.saveTasksJson(tasksJson);
    }

    @JavascriptInterface
    public void pickMedia(int kind) {
        activity.pickMediaFromWeb(kind);
    }

    @JavascriptInterface
    public boolean isNativeAvailable() {
        return true;
    }
}
