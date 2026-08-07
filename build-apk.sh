#!/bin/bash
# ============================================
# AI Chat App - 一键 APK 打包脚本 (Debug)
# ============================================
# 使用方法:
#   chmod +x build-apk.sh
#   ./build-apk.sh
#
# 前置条件:
#   - Node.js >= 18
#   - Android SDK (ANDROID_HOME 已设置)
#   - Java 21+ (Capacitor 插件需要)
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  AI Chat App - Debug APK 打包"
echo "============================================"
echo ""

# 检查 ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    echo "ERROR: 未设置 ANDROID_HOME 环境变量"
    echo "请设置 Android SDK 路径，例如:"
    echo "  export ANDROID_HOME=/opt/android-sdk"
    exit 1
fi

if [ ! -d "$ANDROID_HOME" ]; then
    echo "ERROR: ANDROID_HOME 目录不存在: $ANDROID_HOME"
    exit 1
fi

# 检查 Java
if [ -z "$JAVA_HOME" ]; then
    echo "WARN: JAVA_HOME 未设置，将使用系统默认 Java"
fi

# 可选：如果当前环境需要代理，取消下面注释并修改
# export GRADLE_OPTS="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=18080 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=18080"

# Step 1: 安装前端依赖
echo "[1/4] 安装前端依赖..."
npm install --silent

# Step 2: 构建前端资源
echo "[2/4] 构建前端资源..."
npx vite build

# Step 3: 同步到 Android 项目
echo "[3/4] 同步 Capacitor Android 资源..."
npx cap sync

# Step 4: 构建 Android APK
echo "[4/4] 构建 Android APK..."
cd android
./gradlew assembleDebug

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    FINAL_APK="$SCRIPT_DIR/AI-Chat-Debug.apk"
    cp "$APK_PATH" "$FINAL_APK"
    echo ""
    echo "============================================"
    echo "  APK 构建成功!"
    echo "  原始路径: $(realpath "$APK_PATH")"
    echo "  输出路径: $(realpath "$FINAL_APK")"
    echo "  文件大小: $(du -h "$FINAL_APK" | cut -f1)"
    echo "============================================"
else
    echo ""
    echo "ERROR: APK 构建失败，请检查 Android SDK 配置"
    exit 1
fi
