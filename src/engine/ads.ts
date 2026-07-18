import type { Fatigue } from '../theme';
import { adsEnabled } from '../config';

export function adsAvailable(): boolean {
  return adsEnabled;
}

// 疲労度ごとの「決定後の静かなネイティブ広告」1日あたり上限（設計書 §10）
//   限界=0（出さない）／疲れた=1／普通=1／元気=2（調理が長いぶん多少）
export function adDailyLimit(fatigue: Fatigue): number {
  switch (fatigue) {
    case '限界':
      return 0;
    case '疲れた':
      return 1;
    case '普通':
      return 1;
    case '元気':
      return 2;
  }
}

/**
 * 今「決定後のネイティブ広告」を出してよいか。
 * - サポーター/最近コーヒーをくれた人は常にオフ
 * - 限界モードはゼロ
 * - 1日の上限（疲労度連動）を超えない
 * 意思決定フロー（疲労度→決めて→提案→これにする）の最中では絶対に呼ばないこと。
 * 呼ぶのは「決定後（調理画面）」だけ。
 *
 * 他の2種類は判定が別なので、この関数は使わない：
 * - 常設バナー（疲労度選択/決めて/履歴）：ボタンから余白で隔離した静的表示。
 *   サポーターと、疲労度選択後の限界モードでは出さない（App.tsx の bannerBase）。
 * - 「ごちそうさま」後の全画面広告：料理が終わった後の遷移なので限界モードでも出す。
 *   1日上限も共有しない（共有すると普通モードでネイティブ広告が1回を使い切り、
 *   全画面広告が永久に出なくなるため）。出さないのはサポーターだけ。
 */
export function canShowAd(opts: { fatigue: Fatigue; isSupporter: boolean; todayCount: number }): boolean {
  if (!adsEnabled) return false;
  if (opts.isSupporter) return false;
  return opts.todayCount < adDailyLimit(opts.fatigue);
}
