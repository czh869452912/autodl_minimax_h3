#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_SDK_DIR="$HOME/AppData/Local/Android/Sdk"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$DEFAULT_SDK_DIR}}"

if [[ ! -d "$SDK_DIR" ]]; then
  SDK_DIR="$ROOT_DIR/../build-tools/android-sdk"
fi

if [[ -d "$SDK_DIR/build-tools/36.0.0" ]]; then
  BUILD_TOOLS_DIR="$SDK_DIR/build-tools/36.0.0"
elif [[ -d "$SDK_DIR/build-tools/35.0.0" ]]; then
  BUILD_TOOLS_DIR="$SDK_DIR/build-tools/35.0.0"
else
  BUILD_TOOLS_DIR="$(ls -d "$SDK_DIR/build-tools/"* 2>/dev/null | tail -n 1)"
fi

PLATFORM_DIR="$SDK_DIR/platforms/android-35"
OUT_DIR="$ROOT_DIR/app/build/manual"
CLASS_DIR="$OUT_DIR/classes"
GEN_DIR="$OUT_DIR/generated"

DEFAULT_JBR="C:/Program Files/Android/Android Studio/jbr"
if [[ -n "${JAVA_HOME:-}" ]]; then
  JAVA_HOME_DIR="$JAVA_HOME"
elif [[ -d "$DEFAULT_JBR" ]]; then
  JAVA_HOME_DIR="$DEFAULT_JBR"
else
  JAVA_HOME_DIR="$ROOT_DIR/../build-tools/jdk17"
fi

export JAVA_HOME="$JAVA_HOME_DIR"
export PATH="$JAVA_HOME_DIR/bin:$PATH"

JAVAC_BIN="$JAVA_HOME_DIR/bin/javac"
KEYTOOL_BIN="$JAVA_HOME_DIR/bin/keytool"
JAR_BIN="$JAVA_HOME_DIR/bin/jar"

D8_BIN="$BUILD_TOOLS_DIR/d8"
if [[ -f "$BUILD_TOOLS_DIR/d8.bat" ]]; then
  D8_BIN="$BUILD_TOOLS_DIR/d8.bat"
fi

APKSIGNER_BIN="$BUILD_TOOLS_DIR/apksigner"
if [[ -f "$BUILD_TOOLS_DIR/apksigner.bat" ]]; then
  APKSIGNER_BIN="$BUILD_TOOLS_DIR/apksigner.bat"
fi

ZIPALIGN_BIN="$BUILD_TOOLS_DIR/zipalign"
if [[ -f "$BUILD_TOOLS_DIR/zipalign.exe" ]]; then
  ZIPALIGN_BIN="$BUILD_TOOLS_DIR/zipalign.exe"
fi

AAPT2_BIN="$BUILD_TOOLS_DIR/aapt2"
if [[ -f "$BUILD_TOOLS_DIR/aapt2.exe" ]]; then
  AAPT2_BIN="$BUILD_TOOLS_DIR/aapt2.exe"
fi

if [[ ! -f "$PLATFORM_DIR/android.jar" ]]; then
  echo "Android SDK platform android-35 not found: $PLATFORM_DIR" >&2
  exit 1
fi

mkdir -p "$CLASS_DIR" "$GEN_DIR" "$OUT_DIR/dex"
find "$CLASS_DIR" -type f -delete
find "$GEN_DIR" -type f -delete

find "$ROOT_DIR/app/src/main/java" -name '*.java' -print0 \
  | xargs -0 "$JAVAC_BIN" -source 17 -target 17 -encoding UTF-8 \
      -classpath "$PLATFORM_DIR/android.jar" -d "$CLASS_DIR"

"$AAPT2_BIN" compile --dir "$ROOT_DIR/app/src/main/res" -o "$OUT_DIR/resources.zip"

AAPT_LINK_CMD=(
  "$AAPT2_BIN" link
  -o "$OUT_DIR/unaligned.apk"
  --manifest "$ROOT_DIR/app/src/main/AndroidManifest.xml"
  -I "$PLATFORM_DIR/android.jar"
  --java "$GEN_DIR"
  --min-sdk-version 23
  --target-sdk-version 35
  -0 html -0 css -0 js -0 json
)

AAPT_LINK_CMD+=("$OUT_DIR/resources.zip")

"${AAPT_LINK_CMD[@]}"

"$D8_BIN" \
  --lib "$PLATFORM_DIR/android.jar" \
  --min-api 23 \
  --output "$OUT_DIR/dex" \
  $(find "$CLASS_DIR" -name '*.class' -print)

pushd "$OUT_DIR" >/dev/null
  # aapt2 -A writes backslashes into asset ZIP entries when invoked on Windows.
  # Add the asset tree with jar instead so Android AssetManager sees web/... paths.
  if [[ -d "$ROOT_DIR/app/src/main/assets" ]]; then
    "$JAR_BIN" uf unaligned.apk -C "$ROOT_DIR/app/src/main" assets
  fi
  # Insert classes.dex into APK using jar
  "$JAR_BIN" uf unaligned.apk -C dex classes.dex
popd >/dev/null

if ! "$JAR_BIN" tf "$OUT_DIR/unaligned.apk" | grep -qx 'assets/web/index.html'; then
  echo "APK asset validation failed: web/index.html is missing" >&2
  exit 1
fi
if "$JAR_BIN" tf "$OUT_DIR/unaligned.apk" | grep -qE '^assets/web\\'; then
  echo "APK asset validation failed: backslash asset path detected" >&2
  exit 1
fi

"$ZIPALIGN_BIN" -p -f 4 "$OUT_DIR/unaligned.apk" "$OUT_DIR/aligned.apk"

KEYSTORE="$ROOT_DIR/app/build/autodl-h3-debug.keystore"
if [[ ! -f "$KEYSTORE" ]]; then
  "$KEYTOOL_BIN" -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass android \
    -keypass android \
    -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

"$APKSIGNER_BIN" sign \
  --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$ROOT_DIR/app/build/AutoDL-H3-debug.apk" "$OUT_DIR/aligned.apk"
"$APKSIGNER_BIN" verify "$ROOT_DIR/app/build/AutoDL-H3-debug.apk"
echo "Built: $ROOT_DIR/app/build/AutoDL-H3-debug.apk"
