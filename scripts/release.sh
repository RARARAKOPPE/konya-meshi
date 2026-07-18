#!/bin/bash
# 今日飯 リリース作業ランチャー。このMac固有の環境事情を吸収する:
#  - node/pnpm は dev-env.sh を source しないと PATH に無い
#  - dev-env.sh は EXPO_HOME を .expo-home に向けるが、EASログインは ~/.expo 側にある
#  - npx は無いので eas-cli は pnpm dlx で呼ぶ
# 使い方:
#   scripts/release.sh build    # 本番ビルド（初回はApple IDログイン+2FAを聞かれる）
#   scripts/release.sh submit   # App Store Connect へ提出
#   scripts/release.sh status   # 最近のビルド一覧
set -euo pipefail

source /Users/wmac/AI-edit-Mac/dev-env.sh >/dev/null
export EXPO_HOME="$HOME/.expo"
cd "$(dirname "$0")/.."

# .env の焼き込み事故防止：本番ビルド前に広告設定を目視できるよう表示する
show_env() {
  echo "―― .env（EXPO_PUBLIC_* はこの内容でバイナリに焼き込まれる）――"
  grep -v '^#' .env | grep -v '^$' || true
  echo "――――――――――――――――――――――――――――――"
}

case "${1:-}" in
  build)
    show_env
    read -r -p "この .env で本番ビルドを開始する？ [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "中止"; exit 1; }
    pnpm dlx eas-cli@latest build --platform ios --profile production
    ;;
  submit)
    pnpm dlx eas-cli@latest submit --platform ios --profile production
    ;;
  status)
    pnpm dlx eas-cli@latest build:list --platform ios --limit 5
    ;;
  *)
    echo "使い方: scripts/release.sh {build|submit|status}"
    exit 1
    ;;
esac
