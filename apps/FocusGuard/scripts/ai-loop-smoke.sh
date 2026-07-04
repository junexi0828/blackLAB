#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/FocusGuard.xcodeproj"
DERIVED_DATA_PATH="${FOCUSGUARD_DERIVED_DATA:-/tmp/FocusGuardLoopDerivedData}"
RESULT_BUNDLE_PATH="${FOCUSGUARD_RESULT_BUNDLE:-/tmp/FocusGuardLoop.xcresult}"
SIMULATOR_NAME="${FOCUSGUARD_SIMULATOR_NAME:-iPhone 16}"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/폐관수련.app"
BUNDLE_ID="${FOCUSGUARD_BUNDLE_ID:-com.juns.beyondcave}"

cd "$ROOT_DIR"

echo "[1/5] Regenerating Xcode project"
xcodegen generate

echo "[2/5] Booting simulator: $SIMULATOR_NAME"
if ! xcrun simctl bootstatus "$SIMULATOR_NAME" -b >/dev/null 2>&1; then
  xcrun simctl boot "$SIMULATOR_NAME" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$SIMULATOR_NAME" -b
fi

echo "[3/5] Building app"
rm -rf "$RESULT_BUNDLE_PATH"
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme FocusGuard \
  -destination "platform=iOS Simulator,name=$SIMULATOR_NAME" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" \
  build

echo "[4/5] Installing app"
xcrun simctl install booted "$APP_PATH"

echo "[5/5] Launching in mock camera mode"
xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
SIMCTL_CHILD_FOCUSGUARD_MOCK_CAMERA=1 xcrun simctl launch booted "$BUNDLE_ID"

echo
echo "FocusGuard launched with mock camera mode."
echo "Use the in-app developer panel to toggle face present/absent."
echo "xcresult saved at: $RESULT_BUNDLE_PATH"
