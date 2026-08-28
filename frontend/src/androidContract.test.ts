import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "..", "app", "src", "main", "java", "com", "example", "autodlh3", "MainActivity.java"),
  "utf8",
);

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

  it("serves local MP4 range requests as binary partial responses", () => {
    expect(source).toContain("getRequestHeaders");
    expect(source).toContain("Content-Range");
    expect(source).toContain("new WebResourceResponse(\"video/mp4\", null");
    expect(source).toContain("206");
  });
});
