package com.example.autodlh3;

import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import android.app.Activity;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

public final class Media3PlayerActivity extends Activity {
  public static final String EXTRA_SOURCE = "source";
  private ExoPlayer player;
  private PlayerView playerView;

  @Override protected void onCreate(@Nullable Bundle state) {
    super.onCreate(state);
    String source = getIntent().getStringExtra(EXTRA_SOURCE);
    if (source == null || source.isBlank()) {
      finish();
      return;
    }
    playerView = new PlayerView(this);
    playerView.setLayoutParams(new FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    playerView.setControllerAutoShow(true);
    playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
    playerView.setFullscreenButtonClickListener(this::setFullscreen);
    setContentView(playerView);

    player = new ExoPlayer.Builder(this).build();
    playerView.setPlayer(player);
    player.setMediaItem(MediaItem.fromUri(Uri.parse(source)));
    player.prepare();
    player.play();
  }

  private void setFullscreen(boolean fullscreen) {
    if (android.os.Build.VERSION.SDK_INT >= 30) {
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) {
        if (fullscreen) {
          controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
          controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
          controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        }
      }
    } else {
      getWindow().getDecorView().setSystemUiVisibility(fullscreen
        ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        : View.SYSTEM_UI_FLAG_VISIBLE);
    }
  }

  @Override protected void onStop() {
    super.onStop();
    if (player != null) player.pause();
  }

  @Override protected void onStart() {
    super.onStart();
    if (player != null) player.play();
  }

  @Override protected void onDestroy() {
    if (playerView != null) playerView.setPlayer(null);
    if (player != null) player.release();
    player = null;
    super.onDestroy();
  }
}
