#!/bin/bash
# ==========================================
# AI 角色聊天应用 — 一键 APK 打包脚本
# ==========================================
# 用法：
#   chmod +x build-apk.sh
#   ./build-apk.sh
#
# 前置条件：
#   1. Node.js >= 18 已安装
#   2. Java 17 已安装（JAVA_HOME 指向 Java 17）
#   3. Android SDK 已安装（ANDROID_HOME 已设置）
#   4. Android SDK Platform 35 和 Build Tools 已安装
#
# 输出：
#   android/app/build/outputs/apk/debug/app-debug.apk
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo " AI 角色聊天应用 — APK 打包"
echo "=========================================="

# 检查 Java
if [ -z "$JAVA_HOME" ]; then
  if command -v java &>/dev/null; then
    JAVA_VER=$(java -version 2>&1 | head -1 | grep -oP '"\K[^"]+' | cut -d. -f1)
    if [ "$JAVA_VER" -gt 17 ]; then
      echo "⚠️  当前 Java 版本过高（Java $JAVA_VER），尝试自动切换到 Java 17..."
      # 尝试 mise 管理的 Java 17
      if [ -d "$HOME/.local/share/mise/installs/java/17.0.2" ]; then
        export JAVA_HOME="$HOME/.local/share/mise/installs/java/17.0.2"
        echo "✅ 已切换到 JAVA_HOME=$JAVA_HOME"
      fi
    fi
  fi
fi

if [ -z "$JAVA_HOME" ]; then
  echo "❌ 请设置 JAVA_HOME 指向 Java 17"
  echo "   export JAVA_HOME=/path/to/jdk-17"
  exit 1
fi
echo "✅ JAVA_HOME=$JAVA_HOME"

# 检查 Android SDK
if [ -z "$ANDROID_HOME" ]; then
  if [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  elif [ -d "/opt/android-sdk" ]; then
    export ANDROID_HOME="/opt/android-sdk"
  else
    echo "❌ 请设置 ANDROID_HOME 指向 Android SDK"
    echo "   export ANDROID_HOME=/path/to/android-sdk"
    exit 1
  fi
fi
echo "✅ ANDROID_HOME=$ANDROID_HOME"

# 创建 local.properties
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
echo "✅ local.properties 已创建"

# Step 1: 安装依赖
echo ""
echo "[1/3] 安装前端依赖..."
npm install --silent 2>&1 | tail -3

# Step 2: 构建 Web
echo ""
echo "[2/3] 构建 Web..."
npx vite build 2>&1 | tail -3
echo "✅ Web 构建完成 → dist/"

# Step 3: Capacitor 同步 + Gradle 打包
echo ""
echo "[3/3] Capacitor 同步 + Gradle 打包..."

# 清理旧的构建产物
rm -rf android/app/build/outputs/apk/debug/

# Capacitor 同步
npx cap sync android 2>&1 | tail -3

# Gradle 构建
cd android
chmod +x gradlew
./gradlew assembleDebug 2>&1

# 检查输出
APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
  echo ""
  echo "=========================================="
  echo " ✅ APK 打包成功！"
  echo " 路径: $(realpath "$APK_PATH")"
  echo " 大小: $APK_SIZE"
  echo "=========================================="
else
  echo ""
  echo "=========================================="
  echo " ❌ APK 打包失败"
  echo " 请检查上方错误日志"
  echo "=========================================="
  exit 1
fi