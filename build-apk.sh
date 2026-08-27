#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="${ANDROID_SDK_ROOT:-$ROOT_DIR/../build-tools/android-sdk}"
BUILD_TOOLS_DIR="$SDK_DIR/build-tools/35.0.0"
PLATFORM_DIR="$SDK_DIR/platforms/android-35"
OUT_DIR="$ROOT_DIR/app/build/manual"
CLASS_DIR="$OUT_DIR/classes"
GEN_DIR="$OUT_DIR/generated"
JAVA_HOME_DIR="${JAVA_HOME:-$ROOT_DIR/../build-tools/jdk17}"
JAVAC_BIN="$JAVA_HOME_DIR/bin/javac"
KEYTOOL_BIN="$JAVA_HOME_DIR/bin/keytool"

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

"$BUILD_TOOLS_DIR/aapt2" compile --dir "$ROOT_DIR/app/src/main/res" -o "$OUT_DIR/resources.zip"
"$BUILD_TOOLS_DIR/aapt2" link \
  -o "$OUT_DIR/unaligned.apk" \
  --manifest "$ROOT_DIR/app/src/main/AndroidManifest.xml" \
  -I "$PLATFORM_DIR/android.jar" \
  --java "$GEN_DIR" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  "$OUT_DIR/resources.zip"

"$BUILD_TOOLS_DIR/d8" \
  --lib "$PLATFORM_DIR/android.jar" \
  --min-api 23 \
  --output "$OUT_DIR/dex" \
  $(find "$CLASS_DIR" -name '*.class' -print)

pushd "$OUT_DIR" >/dev/null
  # Android expects classes.dex at the APK root, not under the d8 output folder.
  zip -q -u -j unaligned.apk dex/classes.dex
popd >/dev/null

"$BUILD_TOOLS_DIR/zipalign" -p -f 4 "$OUT_DIR/unaligned.apk" "$OUT_DIR/aligned.apk"

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

"$BUILD_TOOLS_DIR/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$ROOT_DIR/app/build/AutoDL-H3-debug.apk" "$OUT_DIR/aligned.apk"
"$BUILD_TOOLS_DIR/apksigner" verify "$ROOT_DIR/app/build/AutoDL-H3-debug.apk"
echo "Built: $ROOT_DIR/app/build/AutoDL-H3-debug.apk"
