package com.example.autodlh3;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.ImageButton;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/** Native playback surface used by the Android shell and React Native adapter. */
public final class Media3PlayerActivity extends Activity {
    public static final String EXTRA_SOURCE = "media_source";
    public static final String EXTRA_TITLE = "media_title";

    private ExoPlayer player;
    private PlayerView playerView;
    private boolean fullscreen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setKeepScreenOn(true);
        FrameLayout root = new FrameLayout(this);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));
        ImageButton fullscreenButton = new ImageButton(this);
        fullscreenButton.setImageResource(android.R.drawable.ic_menu_crop);
        fullscreenButton.setContentDescription("切换全屏");
        fullscreenButton.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams buttonParams = new FrameLayout.LayoutParams(56, 56);
        buttonParams.gravity = android.view.Gravity.TOP | android.view.Gravity.END;
        buttonParams.topMargin = 20;
        buttonParams.rightMargin = 20;
        root.addView(fullscreenButton, buttonParams);
        fullscreenButton.setOnClickListener(v -> {
            if (fullscreen) exitFullscreen(); else enterFullscreen();
            fullscreen = !fullscreen;
        });
        setContentView(root);
        Uri source = getIntent().getParcelableExtra(EXTRA_SOURCE);
        if (source == null) { finish(); return; }
        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) { playerView.setCustomErrorMessage("视频播放失败，可返回后重试下载"); }
        });
        player.setMediaItem(MediaItem.fromUri(source));
        player.prepare();
        player.play();
    }

    public void enterFullscreen() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().getInsetsController().hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            getWindow().getInsetsController().setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    private void exitFullscreen() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().getInsetsController().show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override public void onBackPressed() {
        if (fullscreen) { exitFullscreen(); fullscreen = false; return; }
        super.onBackPressed();
    }

    @Override protected void onResume() { super.onResume(); if (player != null) player.play(); }
    @Override protected void onPause() { if (player != null) player.pause(); super.onPause(); }
    @Override protected void onDestroy() { if (player != null) { player.release(); player = null; } super.onDestroy(); }
}
