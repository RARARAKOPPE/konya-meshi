// 今日飯 デザイントークン（白ベース＋ナチュラルグリーン＋暖色）
export const theme = {
  bg: '#FCFBF7', // 暖色の白
  surface: '#FFFFFF',
  surfaceAlt: '#F4F2EC', // カード内の淡い面
  greenFill: '#5A9B6F', // ボタン等の主役グリーン
  greenFillDark: '#4C8A60',
  greenTint: '#EAF3E6', // 緑の淡い背景
  greenText: '#2F6B45', // 緑背景の上の文字
  textPrimary: '#2A2A28',
  textSecondary: '#6B6B66',
  textMuted: '#9A9A93',
  border: '#E7E5DD',
  borderStrong: '#D6D3C8',
  warnTint: '#FAEEDA',
  warnText: '#854F0B',
  onGreen: '#FFFFFF',
  radius: 16,
  radiusLg: 20,
} as const;

export type Fatigue = '元気' | '普通' | '疲れた' | '限界';
