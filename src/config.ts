export const config = {
  purchasesMode: process.env.EXPO_PUBLIC_PURCHASES_MODE ?? 'disabled',
  // ADS_MODE: 'disabled'=出さない／'placeholder'=旧モックUI／'live'=AdMob実広告(react-native-google-mobile-ads)。
  adsMode: process.env.EXPO_PUBLIC_ADS_MODE ?? 'disabled',
  // オンデバイスAI提案（Apple Foundation Models）。'auto'=対応端末で使う（既定）, 'off'=常に無効。
  // 実際に使えるかは端末側の可用性判定（src/engine/ondevice.ts）で最終ゲートする。
  onDeviceMode: process.env.EXPO_PUBLIC_ONDEVICE_MODE ?? 'auto',
};

export const purchasesEnabled = config.purchasesMode === 'mock';
// 'disabled' 以外（'placeholder'/'live'）なら広告枠自体は表示する。
export const adsEnabled = config.adsMode !== 'disabled';
// 'live' のみ実SDK（react-native-google-mobile-ads）を使う。'placeholder' は旧モックUIのまま。
export const adsLive = config.adsMode === 'live';
// 'off' 以外なら有効（既定 auto）。運用コスト0の第1層。
export const onDeviceEnabled = config.onDeviceMode !== 'off';
