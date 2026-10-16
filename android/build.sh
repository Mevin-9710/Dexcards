#!/usr/bin/env bash
set -e

PROJECT_DIR="/data/data/com.termux/files/home/FlashcardMCP/android"
SDK_JAR="/data/data/com.termux/files/home/android-sdk/android-33.jar"
BIN_DIR="$PROJECT_DIR/bin"
SRC_DIR="$PROJECT_DIR/src"
RES_DIR="$PROJECT_DIR/res"
ASSETS_DIR="$PROJECT_DIR/assets"
MANIFEST="$PROJECT_DIR/AndroidManifest.xml"
KEYSTORE="$PROJECT_DIR/flashcard-release.keystore"
OUT_APK="/data/data/com.termux/files/home/FlashcardMCP/FlashcardMCP.apk"

echo "=========================================================="
echo " Building Lumino Liquid Glass Flashcard Android APK"
echo " Target: Android 11+ (API 30+), Architecture: Universal"
echo "=========================================================="

echo "[1/7] Refreshing build directories and web assets..."
rm -rf "$BIN_DIR"
mkdir -p "$BIN_DIR/gen" "$BIN_DIR/classes" "$BIN_DIR/dex" "$ASSETS_DIR"
cp -r /data/data/com.termux/files/home/FlashcardMCP/public/* "$ASSETS_DIR/"

echo "[2/7] Generating R.java with AAPT..."
aapt package -f -m \
    -J "$BIN_DIR/gen" \
    -M "$MANIFEST" \
    -S "$RES_DIR" \
    -I "$SDK_JAR"

echo "[3/7] Compiling Java sources with javac..."
javac -cp "$SDK_JAR" \
    -d "$BIN_DIR/classes" \
    -source 1.8 -target 1.8 \
    $(find "$SRC_DIR" "$BIN_DIR/gen" -name "*.java")

echo "[4/7] Compiling DEX bytecode with D8 (min-api 30)..."
d8 --min-api 30 \
    --output "$BIN_DIR/dex" \
    --lib "$SDK_JAR" \
    $(find "$BIN_DIR/classes" -name "*.class")

echo "[5/7] Packaging resources and web assets into APK..."
aapt package -f \
    -M "$MANIFEST" \
    -S "$RES_DIR" \
    -A "$ASSETS_DIR" \
    -I "$SDK_JAR" \
    -F "$BIN_DIR/FlashcardMCP.unsigned.apk"

cd "$BIN_DIR/dex"
aapt add "$BIN_DIR/FlashcardMCP.unsigned.apk" classes.dex
cd "$PROJECT_DIR"

echo "[6/7] Zipaligning APK on 4-byte boundaries..."
zipalign -f -p 4 "$BIN_DIR/FlashcardMCP.unsigned.apk" "$BIN_DIR/FlashcardMCP.aligned.apk"

echo "[7/7] Generating release keystore and signing APK..."
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair -v \
        -keystore "$KEYSTORE" \
        -alias flashcard \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass flashcard_release \
        -keypass flashcard_release \
        -dname "CN=Lumino, OU=Mobile MCP, O=Lumino Flashcards, L=Global, ST=OpenSource, C=US"
fi

apksigner sign \
    --ks "$KEYSTORE" \
    --ks-key-alias flashcard \
    --ks-pass pass:flashcard_release \
    --key-pass pass:flashcard_release \
    --v1-signing-enabled true \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    --out "$OUT_APK" \
    "$BIN_DIR/FlashcardMCP.aligned.apk"

echo "[✓] Verifying APK signature..."
apksigner verify -v "$OUT_APK"

cp -f "$OUT_APK" "/data/data/com.termux/files/home/FlashcardMCP.apk"
cp -f "$OUT_APK" "/data/data/com.termux/files/home/FlashcardMCP-release.apk"

echo ""
echo "=========================================================="
echo " BUILD SUCCESSFUL! APK generated at:"
echo " $OUT_APK"
echo " /data/data/com.termux/files/home/FlashcardMCP.apk"
echo "=========================================================="
