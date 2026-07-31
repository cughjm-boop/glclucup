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
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.CAMERA" />

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

# Step 2: Create Java source (WebView wrapper with local HTTP server)
cat > "$BUILD_DIR/MainActivity.java" << 'JAVA'
package com.aichat.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.net.Uri;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.view.WindowInsetsController;
import android.view.WindowInsets;
import android.view.View;
import android.graphics.Color;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Map;
import java.util.Locale;

public class MainActivity extends Activity {
    private WebView webView;
    private TextToSpeech tts;
    private static final String LOCAL_HOST = "https://app.local/";
    private static final int FILE_CHOOSER_REQUEST = 100;
    private static final int PERMISSION_REQUEST = 200;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge with safe area insets (don't hide status bar, let CSS handle it)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController ctrl = getWindow().getInsetsController();
                if (ctrl != null) {
                    // Show status bar with transparent background for safe area
                    ctrl.show(WindowInsets.Type.statusBars());
                    ctrl.setSystemBarsAppearance(
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
                }
                // Allow content to draw behind system bars
                getWindow().setDecorFitsSystemWindows(false);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                getWindow().setStatusBarColor(Color.TRANSPARENT);
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
            }
        } catch (Exception ignored) {}

        // Initialize Android TTS engine
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    // Set Chinese language
                    int result = tts.setLanguage(Locale.CHINESE);
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(Locale.US);
                    }
                }
            }
        });

        webView = new WebView(this);
        webView.setWebViewClient(new LocalWebViewClient());
        webView.setWebChromeClient(new ChromeClient());

        // Register Android TTS bridge for JavaScript
        webView.addJavascriptInterface(new AndroidTTSBridge(), "AndroidTTS");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setBackgroundColor(Color.WHITE);
        setContentView(webView);

        // Load HTML directly via loadDataWithBaseURL to avoid network request
        try {
            String html = readAsset("index.html");
            webView.loadDataWithBaseURL(LOCAL_HOST, html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            webView.loadData("<h1>Failed to load app</h1>", "text/html", "UTF-8");
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }

    /**
     * Android 原生 TTS 桥接类 - 暴露给 JavaScript 调用
     * 在 JS 中通过 window.AndroidTTS.speak(text, speed, pitch) 调用
     */
    public class AndroidTTSBridge {
        private String currentUtteranceId = null;

        @JavascriptInterface
        public void speak(String text, float speed, float pitch) {
            if (tts == null) return;

            // Map speed: 0.5-2.0 → Android rate 0.5-2.0
            float ttsRate = Math.max(0.1f, Math.min(3.0f, speed));
            // Map pitch: 0.5-2.0 → Android pitch 0.5-2.0
            float ttsPitch = Math.max(0.1f, Math.min(3.0f, pitch));

            tts.setSpeechRate(ttsRate);
            tts.setPitch(ttsPitch);

            currentUtteranceId = "tts_" + System.currentTimeMillis();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, currentUtteranceId);
            } else {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null);
            }
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) {
                tts.stop();
            }
            currentUtteranceId = null;
        }

        @JavascriptInterface
        public boolean isSpeaking() {
            return tts != null && tts.isSpeaking();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST) {
            // Permission granted, retry file chooser if needed
            if (filePathCallback != null) {
                openFileChooser();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    Uri result = data.getData();
                    if (result != null) {
                        results = new Uri[]{result};
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    private void openFileChooser() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        String[] mimeTypes = {"image/*", "audio/*", "video/*", "application/json", "text/csv", "text/plain",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        startActivityForResult(Intent.createChooser(intent, "选择文件"), FILE_CHOOSER_REQUEST);
    }

    private class ChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                          FileChooserParams fileChooserParams) {
            MainActivity.this.filePathCallback = filePathCallback;
            openFileChooser();
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            // Grant all permissions requested by WebView (camera, microphone, etc.)
            request.grant(request.getResources());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private String readAsset(String path) throws IOException {
        InputStream is = getAssets().open(path);
        BufferedReader r = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) {
            sb.append(line).append("\n");
        }
        r.close();
        return sb.toString();
    }

    private class LocalWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (url.startsWith(LOCAL_HOST)) {
                String path = url.substring(LOCAL_HOST.length());
                if (path.isEmpty()) path = "index.html";
                int qi = path.indexOf('?');
                if (qi >= 0) path = path.substring(0, qi);
                int fi = path.indexOf('#');
                if (fi >= 0) path = path.substring(0, fi);

                try {
                    InputStream is = getAssets().open(path);
                    String mime = getMimeType(path);
                    String encoding = isTextMime(mime) ? "UTF-8" : null;
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Cross-Origin-Resource-Policy", "cross-origin");
                    return new WebResourceResponse(mime, encoding, 200, "OK", headers, is);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                        new ByteArrayInputStream("Not Found".getBytes()));
                }
            }
            return super.shouldInterceptRequest(view, request);
        }
    }

    private static String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".wasm")) return "application/wasm";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private static boolean isTextMime(String mime) {
        return mime.startsWith("text/") || mime.equals("application/javascript")
            || mime.equals("application/json") || mime.equals("image/svg+xml");
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
    "$BUILD_DIR/obj/com/aichat/app/"*.class 2>&1

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

# Step 8: Add DEX file to APK root (NOT in a subdirectory!)
echo "8. Adding DEX file..."
cp "$BUILD_DIR/obj/classes.dex" "$BUILD_DIR/apk/classes.dex"
cd "$BUILD_DIR/apk"
zip -q base.apk classes.dex
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