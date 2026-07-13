import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { MealHistory } from '../types';
import { computeDeficits, TRACK_CATEGORIES } from '../engine/nutrition';

export function HistoryScreen({ history, onBack }: { history: MealHistory[]; onBack: () => void }) {
  const d = computeDeficits(history);
  const recent = [...history].sort((a, b) => b.cookedAt - a.cookedAt).slice(0, 7);

  const denom = Math.max(
    1,
    ...TRACK_CATEGORIES.map((c) => d.counts[c] ?? 0),
    ...Object.values(d.needed ?? {})
  );

  const headline = !d.enough
    ? 'まだ記録が少なめです'
    : d.topDeficit
      ? `今週は${d.topDeficit}が不足ぎみ`
      : 'バランスは良好です';

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>食育履歴</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={s.sub}>直近7日のバランス</Text>

      <View style={[s.headlineBox, !d.enough && s.headlineNeutral, d.enough && d.topDeficit && s.headlineWarn]}>
        <Text style={[s.headlineText, d.enough && d.topDeficit && s.headlineWarnText]}>
          {headline}
          {d.enough && d.topDeficit ? ' → 次の提案で優先します' : ''}
        </Text>
      </View>

      <Text style={s.sectionLabel}>カテゴリ別の回数</Text>
      {TRACK_CATEGORIES.map((c) => {
        const count = d.counts[c] ?? 0;
        const lack = d.enough && count < (d.needed[c] ?? 0);
        return (
          <View key={c} style={s.barRow}>
            <Text style={s.barLabel}>{c}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, lack && s.barFillWarn, { width: `${Math.round((count / denom) * 100)}%` }]} />
            </View>
            <Text style={[s.barCount, lack && s.barCountWarn]}>{count}回{lack ? ' 不足' : ''}</Text>
          </View>
        );
      })}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: theme.greenFill }]} />
          <Text style={s.legendText}>足りている</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: '#EF9F27' }]} />
          <Text style={s.legendText}>不足ぎみ</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>最近作った料理</Text>
      {recent.length === 0 ? (
        <Text style={s.empty}>まだ記録がありません。「これにする」で記録されます。</Text>
      ) : (
        recent.map((m) => (
          <View key={m.id} style={s.mealRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.mealTitle}>{m.title}</Text>
              <Text style={s.mealMeta}>
                {m.dinnerDate}
                {m.categories.length > 0 ? ` ・ ${m.categories.join(' ')}` : ''}
              </Text>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  sub: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginTop: 22, marginBottom: 12 },

  headlineBox: { borderRadius: 14, padding: 14, marginTop: 14, backgroundColor: theme.greenTint },
  headlineNeutral: { backgroundColor: theme.surfaceAlt },
  headlineWarn: { backgroundColor: theme.warnTint },
  headlineText: { fontSize: 14, fontWeight: '500', color: theme.greenText, lineHeight: 20 },
  headlineWarnText: { color: theme.warnText },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  barLabel: { width: 36, fontSize: 13, color: theme.textPrimary },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: theme.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7, backgroundColor: theme.greenFill },
  barFillWarn: { backgroundColor: '#EF9F27' },
  barCount: { width: 64, fontSize: 12, color: theme.textSecondary, textAlign: 'right' },
  barCountWarn: { color: theme.warnText },

  legend: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: theme.textMuted },

  empty: { fontSize: 13, color: theme.textMuted },
  mealRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  mealTitle: { fontSize: 14, fontWeight: '500', color: theme.textPrimary },
  mealMeta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
