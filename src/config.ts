export const config = {
  purchasesMode: process.env.EXPO_PUBLIC_PURCHASES_MODE ?? 'disabled',
  adsMode: process.env.EXPO_PUBLIC_ADS_MODE ?? 'disabled',
  // オンデバイスAI提案（Apple Foundation Models）。'auto'=対応端末で使う（既定）, 'off'=常に無効。
  // 実際に使えるかは端末側の可用性判定（src/engine/ondevice.ts）で最終ゲートする。
  onDeviceMode: process.env.EXPO_PUBLIC_ONDEVICE_MODE ?? 'auto',
};

export const purchasesEnabled = config.purchasesMode === 'mock';
export const adsEnabled = config.adsMode === 'placeholder';
// 'off' 以外なら有効（既定 auto）。運用コスト0の第1層。
export const onDeviceEnabled = config.onDeviceMode !== 'off';
