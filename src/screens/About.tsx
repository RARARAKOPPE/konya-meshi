import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import appJson from '../../app.json';
import { useAdsPrivacyOptionsRequired } from '../components/Ads';
import { showAdsPrivacyOptionsForm } from '../engine/adsSdk';

// App Store の審査ではプライバシーポリシーとサポート窓口への導線が求められる。
// ストア掲載欄だけでなくアプリ内にも置いておくと、審査でも実利用でも収まりが良い。
// AdMobのapp-ads.txtはデベロッパーサイトのドメインのルートに置く必要があり、はてなブログでは
// ルートにファイルを置けない。そのためGitHub Pages（rararakoppe.github.io）へ移設した。
// サイトの実体は別リポジトリ rararakoppe.github.io。
export const PRIVACY_POLICY_URL = 'https://rararakoppe.github.io/konya-meshi/privacy-policy.html';
export const SUPPORT_EMAIL = 'sw.work.dev@gmail.com';

// バージョンは app.json から読む（画面に直書きすると更新漏れで実態とズレるため）。
const VERSION = (appJson as { expo: { version: string } }).expo.version;

async function openUrl(url: string, failMessage: string) {
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) throw new Error('cannot open');
    await Linking.openURL(url);
  } catch {
    Alert.alert('開けませんでした', failMessage);
  }
}

export function AboutScreen({ onBack }: { onBack: () => void }) {
  // EEA等ではUMPが「同意をあとから変更する導線」の掲示を義務づける。対象外の地域では出さない。
  const showPrivacyOptions = useAdsPrivacyOptionsRequired();
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>このアプリについて</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={s.lead}>
        「今日飯」は、疲れて帰宅した日の夕飯を代わりに決めるアプリです。今日の疲れ具合と、食べる人、
        冷蔵庫にあるものから、作れる一品をすぐに提案します。
      </Text>

      <Text style={s.sectionLabel}>できること</Text>
      <View style={s.card}>
        <Text style={s.item}>・疲労度に合わせて、工程数と調理時間を抑えた献立を提案します</Text>
        <Text style={s.item}>・アレルギー・妊娠中・子どもの年齢に応じて、危ない料理を自動で除外します</Text>
        <Text style={s.item}>・小鉢や汁椀、もう一品の主菜を足して一汁三菜に近づけられます</Text>
        <Text style={s.item}>・直近に食べたものを避けて提案し、栄養の偏りも見えるようにしています</Text>
      </View>

      {/* 安全に関わる免責。アレルギーは命に関わるため、目立つ場所に明示する。 */}
      <Text style={s.sectionLabel}>安全についての大切なお願い</Text>
      <View style={[s.card, s.cardWarn]}>
        <Text style={s.warnText}>
          アレルギーや体調への配慮は、登録された情報をもとにアプリが機械的に判定した「目安」です。
          市販の調味料や加工品は、同じ商品名でもメーカーや時期によって原材料が異なります。
          {'\n\n'}
          実際に召し上がる前に、必ずご自身で商品の原材料表示をご確認ください。
          アレルギーをお持ちの方や、妊娠中・授乳中の方、小さなお子さまの食事については、
          最終的な判断を必ず人が行ってください。
        </Text>
      </View>

      <Text style={s.sectionLabel}>提案のしくみ</Text>
      <View style={s.card}>
        <Text style={s.item}>
          対応端末では、端末内のAI（Apple Intelligence）が献立を考えます。この処理は端末の中だけで完結し、
          入力した情報が外部に送られることはありません。対応していない端末では、アプリに収録した献立から選びます。
        </Text>
      </View>

      <Text style={s.sectionLabel}>プライバシーとお問い合わせ</Text>
      <TouchableOpacity
        style={s.row}
        activeOpacity={0.7}
        onPress={() => openUrl(PRIVACY_POLICY_URL, 'ブラウザでプライバシーポリシーを開けませんでした。')}
      >
        <Text style={s.rowText}>プライバシーポリシー</Text>
        <Text style={s.rowArrow}>›</Text>
      </TouchableOpacity>
      {showPrivacyOptions && (
        <TouchableOpacity
          style={s.row}
          activeOpacity={0.7}
          onPress={async () => {
            const shown = await showAdsPrivacyOptionsForm();
            if (!shown) Alert.alert('開けませんでした', '広告のプライバシー設定を表示できませんでした。時間をおいて試してください。');
          }}
        >
          <Text style={s.rowText}>広告のプライバシー設定</Text>
          <Text style={s.rowArrow}>›</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={s.row}
        activeOpacity={0.7}
        onPress={() =>
          openUrl(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('今日飯アプリについて')}`,
            `メールアプリを開けませんでした。お手数ですが ${SUPPORT_EMAIL} 宛にご連絡ください。`)
        }
      >
        <Text style={s.rowText}>お問い合わせ</Text>
        <Text style={s.rowArrow}>›</Text>
      </TouchableOpacity>

      <Text style={s.version}>バージョン {VERSION}</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },
  lead: { fontSize: 14, color: theme.textSecondary, lineHeight: 22, marginTop: 16 },
  sectionLabel: { fontSize: 13, color: theme.textMuted, marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 8 },
  cardWarn: { backgroundColor: '#FFF6F4', borderColor: '#E9C4BB' },
  item: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  warnText: { fontSize: 13, color: '#8A4B3C', lineHeight: 21 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 52, paddingHorizontal: 14, marginTop: 8,
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
  },
  rowText: { fontSize: 14, color: theme.textPrimary },
  rowArrow: { fontSize: 18, color: theme.textMuted },
  version: { fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 24 },
});
