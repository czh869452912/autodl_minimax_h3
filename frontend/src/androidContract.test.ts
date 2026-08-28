import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "..", "app", "src", "main", "java", "com", "example", "autodlh3", "MainActivity.java"),
  "utf8",
);
const manifest = readFileSync(join(process.cwd(), "..", "app", "src", "main", "AndroidManifest.xml"), "utf8");

describe("Android media lifecycle contract", () => {
  it("reconciles downloads when the Activity returns to the foreground", () => {
    expect(source).toContain("protected void onResume()");
    expect(source).toContain("reconcileDownloads();");
  });

  it("provides a WebView fullscreen custom view lifecycle", () => {
    expect(source).toContain("onShowCustomView");
    expect(source).toContain("onHideCustomView");
    expect(source).toContain("nativeBackPressed");
  });

  it("exposes downloaded MP4 files through a seekable content provider", () => {
    expect(source).toContain("content://com.example.autodlh3.localmedia/");
    expect(source).toContain("getLocalMediaUri");
    expect(manifest).toContain("LocalMediaProvider");
  });
});
