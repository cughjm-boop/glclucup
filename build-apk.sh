#!/bin/bash
set -e

# APK Builder Script - Builds a properly signed APK from web assets
# Uses Android SDK tools directly (no Gradle required)

ANDROID_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/android-sdk}}"
BUILD_TOOLS="$ANDROID_SDK/build-tools/35.0.0"
PLATFORM="$ANDROID_SDK/platforms/android-35"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/apk-build"
OUTPUT_DIR="$PROJECT_DIR"
APP_NAME="AI Chat"
PACKAGE="com.aichat.app"
VERSION_CODE="1"
VERSION_NAME="1.0.0"
MIN_SDK="24"
TARGET_SDK="35"

echo "=== Building APK for $APP_NAME ==="

# Clean and create build dirs
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/obj"
mkdir -p "$BUILD_DIR/apk"
mkdir -p "$BUILD_DIR/gen"
mkdir -p "$BUILD_DIR/res-flat"

# Step 1: Create AndroidManifest.xml with proper version info
cat > "$BUILD_DIR/AndroidManifest.xml" << MANIFEST
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="$PACKAGE"
    android:versionCode="$VERSION_CODE"
    android:versionName="$VERSION_NAME">

    <uses-sdk
        android:minSdkVersion="$MIN_SDK"
        android:targetSdkVersion="$TARGET_SDK" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="AI Chat"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar"
        android:usesCleartextTraffic="true"
        android:extractNativeLibs="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:hardwareAccelerated="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
MANIFEST

echo "1. Created AndroidManifest.xml"

# Step 2: Create Java source (WebView wrapper)
cat > "$BUILD_DIR/MainActivity.java" << 'JAVA'
package com.aichat.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.view.WindowManager;
import android.view.View;
import android.graphics.Color;
import android.os.Build;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        WebView webView = new WebView(this);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        webView.setBackgroundColor(Color.WHITE);

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        WebView webView = (WebView) findViewById(android.R.id.content);
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
JAVA

echo "2. Created MainActivity.java"

# Step 3: Compile Java source
echo "3. Compiling Java..."
javac --release 17 \
    -cp "$PLATFORM/android.jar" \
    -d "$BUILD_DIR/obj" \
    "$BUILD_DIR/MainActivity.java" 2>&1

echo "3. Done compiling Java"

# Step 4: Convert to dex
echo "4. Converting to DEX..."
"$BUILD_TOOLS/d8" \
    --lib "$PLATFORM/android.jar" \
    --output "$BUILD_DIR/obj" \
    "$BUILD_DIR/obj/com/aichat/app/MainActivity.class" 2>&1

echo "4. Done converting to DEX"

# Step 5: Create a proper launcher icon (48x48 PNG)
echo "5. Creating launcher icon..."
mkdir -p "$BUILD_DIR/res/mipmap-hdpi"
mkdir -p "$BUILD_DIR/res/mipmap-mdpi"
mkdir -p "$BUILD_DIR/res/mipmap-xhdpi"
mkdir -p "$BUILD_DIR/res/mipmap-xxhdpi"
mkdir -p "$BUILD_DIR/res/mipmap-xxxhdpi"
python3 -c "
import struct, zlib

def create_png(size):
    # Create a simple blue circle icon on transparent background
    raw_data = b''
    cx, cy = size // 2, size // 2
    r = int(size * 0.4)
    for y in range(size):
        raw_data += b'\x00'  # filter byte
        for x in range(size):
            dx, dy = x - cx, y - cy
            if dx*dx + dy*dy <= r*r:
                raw_data += b'\x4a\x90\xd9\xff'  # blue RGBA
            else:
                raw_data += b'\x00\x00\x00\x00'  # transparent

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    return sig + ihdr + idat + iend

sizes = {'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192}
for folder, size in sizes.items():
    with open(f'$BUILD_DIR/res/{folder}/ic_launcher.png', 'wb') as f:
        f.write(create_png(size))
print('Icons created')
" 2>&1

echo "5. Done creating icons"

# Step 6: Compile resources with aapt2
echo "6. Compiling resources..."
"$BUILD_TOOLS/aapt2" compile \
    -o "$BUILD_DIR/res-flat" \
    --dir "$BUILD_DIR/res" 2>&1

echo "6. Done compiling resources"

# Step 7: Link resources with aapt2 (with version and SDK flags)
echo "7. Linking APK..."
FLAT_ARGS=""
for f in "$BUILD_DIR/res-flat"/*.flat; do
    if [ -f "$f" ]; then
        FLAT_ARGS="$FLAT_ARGS -R $f"
    fi
done

"$BUILD_TOOLS/aapt2" link \
    -o "$BUILD_DIR/apk/base.apk" \
    -I "$PLATFORM/android.jar" \
    --manifest "$BUILD_DIR/AndroidManifest.xml" \
    --java "$BUILD_DIR/gen" \
    -A "$PROJECT_DIR/dist" \
    --auto-add-overlay \
    --version-code "$VERSION_CODE" \
    --version-name "$VERSION_NAME" \
    --min-sdk-version "$MIN_SDK" \
    --target-sdk-version "$TARGET_SDK" \
    $FLAT_ARGS 2>&1

echo "7. Done linking APK"

# Step 8: Add DEX files to APK
echo "8. Adding DEX files..."
mkdir -p "$BUILD_DIR/apk/classes"
cp "$BUILD_DIR/obj/classes.dex" "$BUILD_DIR/apk/classes/"
cd "$BUILD_DIR/apk"
zip -q -r base.apk classes/
echo "8. Done adding DEX"

# Step 9: Zipalign the APK (required for proper memory mapping)
echo "9. Zipaligning APK..."
"$BUILD_TOOLS/zipalign" -v -p 4 "$BUILD_DIR/apk/base.apk" "$BUILD_DIR/apk/aligned.apk" 2>&1
mv "$BUILD_DIR/apk/aligned.apk" "$BUILD_DIR/apk/base.apk"
echo "9. Done zipaligning"

# Step 10: Create debug keystore and sign
echo "10. Signing APK..."
keytool -genkey -v \
    -keystore "$BUILD_DIR/debug.keystore" \
    -alias androiddebugkey \
    -storepass android \
    -keypass android \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" \
    -storetype PKCS12 2>/dev/null

"$BUILD_TOOLS/apksigner" sign \
    --ks "$BUILD_DIR/debug.keystore" \
    --ks-pass pass:android \
    --ks-key-alias androiddebugkey \
    --key-pass pass:android \
    "$BUILD_DIR/apk/base.apk" 2>&1

echo "10. Done signing"

# Step 11: Verify the APK
echo "11. Verifying APK..."
"$BUILD_TOOLS/apksigner" verify --verbose "$BUILD_DIR/apk/base.apk" 2>&1

# Step 12: Copy APK to output
cp "$BUILD_DIR/apk/base.apk" "$OUTPUT_DIR/ai-chat.apk"

echo ""
echo "=== APK Built Successfully! ==="
echo "Output: $OUTPUT_DIR/ai-chat.apk"
ls -lh "$OUTPUT_DIR/ai-chat.apk"
"$BUILD_TOOLS/aapt" dump badging "$OUTPUT_DIR/ai-chat.apk" 2>&1 | head -5