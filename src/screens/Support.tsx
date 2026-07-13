import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { TipTier } from '../engine/purchases';

const TIPS: { tier: TipTier; label: string }[] = [
  { tier: 150, label: '¥150' },
  { tier: 300, label: '¥300' },
  { tier: 600, label: '¥600' },
];

export function SupportScreen({
  isSupporter,
  onSubscribe,
  onTip,
  onRestore,
  purchasesAvailable,
  onBack,
}: {
  isSupporter: boolean;
  onSubscribe: () => Promise<void> | void;
  onTip: (tier: TipTier) => Promise<void> | void;
  onRestore: () => Promise<void> | void;
  purchasesAvailable: boolean;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>アプリを応援する</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={[s.card, isSupporter && s.cardActive]}>
        <Text style={s.cardTitle}>サポーター {isSupporter ? '（登録中）' : '¥150 / 月'}</Text>
        <Text style={s.cardDesc}>広告オフ ＋ 家族と冷蔵庫・献立を共有</Text>
        {!purchasesAvailable ? (
          <Text style={s.disabledNote}>サポーター登録は準備中です。現在のMVPでは課金なしで全機能を使えます。</Text>
        ) : isSupporter ? (
          <>
            <Text style={s.activeNote}>ありがとうございます。広告は表示されません。</Text>
            <Text style={s.cancelNote}>解約は App Store / Google Play の定期購入から行えます。</Text>
          </>
        ) : (
          <TouchableOpacity style={[s.primaryBtn, busy && s.disabled]} disabled={busy} activeOpacity={0.85} onPress={() => run(onSubscribe)}>
            <Text style={s.primaryBtnText}>サポーターになる</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>コーヒーをおごる</Text>
        <Text style={s.cardDesc}>一回きりの応援です（特典はありません・ただ嬉しいです）</Text>
        {!purchasesAvailable ? (
          <Text style={s.disabledNote}>投げ銭も本番課金の接続後に有効になります。</Text>
        ) : (
          <View style={s.tipRow}>
            {TIPS.map((t) => (
              <TouchableOpacity key={t.tier} style={[s.tipBtn, busy && s.disabled]} disabled={busy} activeOpacity={0.85} onPress={() => run(() => onTip(t.tier))}>
                <Text style={s.tipBtnText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {purchasesAvailable && (
        <TouchableOpacity style={s.restore} disabled={busy} onPress={() => run(onRestore)}>
          <Text style={s.link}>購入を復元する</Text>
        </TouchableOpacity>
      )}

      <Text style={s.note}>
        健康情報（アレルギー・体の状態）は端末内に保存され、課金には使われません。サポーター登録を有効にする場合は、ストア課金の接続後にこの画面へ反映します。
      </Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },

  card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 16, marginTop: 14 },
  cardActive: { borderColor: theme.greenFill, backgroundColor: theme.greenTint },
  cardTitle: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  cardDesc: { fontSize: 13, color: theme.textSecondary, marginTop: 6, lineHeight: 19 },
  activeNote: { fontSize: 13, color: theme.greenText, fontWeight: '500', marginTop: 12 },
  disabledNote: { fontSize: 13, color: theme.textSecondary, marginTop: 12, lineHeight: 19 },
  cancelNote: { fontSize: 11, color: theme.textMuted, marginTop: 6, lineHeight: 16 },

  primaryBtn: { backgroundColor: theme.greenFill, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryBtnText: { color: theme.onGreen, fontSize: 16, fontWeight: '600' },

  tipRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tipBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  tipBtnText: { fontSize: 16, color: theme.textPrimary, fontWeight: '600' },

  restore: { alignItems: 'center', paddingVertical: 18 },
  disabled: { opacity: 0.5 },
  note: { fontSize: 11, color: theme.textMuted, lineHeight: 17, marginTop: 8 },
});
