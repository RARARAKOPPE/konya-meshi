import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { ExtractedItem } from '../engine/extract';
import { classify } from '../engine/classify';

interface Row {
  name: string;
  category: string;
  amount: string | null;
}

function rowFrom(it: ExtractedItem): Row {
  return { name: it.name, category: it.category, amount: it.amount ?? null };
}

// 卵だけ個数を入れられるようにする（残量管理の対象がこれだけのため）
function needsAmount(name: string): boolean {
  return classify(name).canonical === '卵';
}

export function ExtractReviewScreen({
  items,
  mode,
  onConfirm,
  onCancel,
}: {
  items: ExtractedItem[];
  mode: 'fridge' | 'receipt';
  onConfirm: (picked: { name: string; amount: string | null }[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(items.map(rowFrom));
  const inputs = useRef<Record<number, TextInput | null>>({});

  const rename = (i: number, name: string) =>
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const c = classify(name);
        // 入力に合う食材が辞書にあればカテゴリを更新。無ければ元の推定カテゴリを保つ。
        return { ...r, name, category: c.matched ? c.category : r.category };
      })
    );

  const setAmount = (i: number, amount: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, amount: amount || null } : r)));

  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const addRow = () => {
    setRows((rs) => [...rs, { name: '', category: 'その他', amount: null }]);
    setTimeout(() => inputs.current[rows.length]?.focus(), 50);
  };

  const selected = rows.filter((r) => r.name.trim());

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={s.link}>← やめる</Text>
        </TouchableOpacity>
        <Text style={s.h2}>{mode === 'receipt' ? 'レシートの読み取り結果' : '写真の読み取り結果'}</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={s.note}>
        文字つぶれや商品名で読み間違うことがあります。名前はタップで修正、いらない物は ✕ で削除、読めなかった物は下から追加できます。
      </Text>

      {rows.length === 0 ? (
        <Text style={s.empty}>読み取れた食材はありません。下の「＋手入力で追加」から登録できます。</Text>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={s.row}>
            <TextInput
              ref={(el) => {
                inputs.current[i] = el;
              }}
              style={s.nameInput}
              value={r.name}
              onChangeText={(t) => rename(i, t)}
              placeholder="食材名"
              placeholderTextColor={theme.textMuted}
              returnKeyType="done"
            />
            {needsAmount(r.name) ? (
              <TextInput
                style={s.amountInput}
                value={r.amount ?? ''}
                onChangeText={(t) => setAmount(i, t)}
                placeholder={classify(r.name).canonical === '卵' ? '10個' : '5kg'}
                placeholderTextColor={theme.textMuted}
                returnKeyType="done"
              />
            ) : (
              <Text style={s.cat}>{r.category || 'その他'}</Text>
            )}
            <TouchableOpacity
              onPress={() => remove(i)}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={s.delBtn}
            >
              <Text style={s.delMark}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={s.addBtn} activeOpacity={0.7} onPress={addRow}>
        <Text style={s.addBtnText}>＋ 手入力で追加</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.primaryBtn, selected.length === 0 && s.disabled]}
        disabled={selected.length === 0}
        activeOpacity={0.85}
        onPress={() => onConfirm(selected.map((r) => ({ name: r.name.trim(), amount: r.amount })))}
      >
        <Text style={s.primaryBtnText}>{selected.length}品を冷蔵庫に追加</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  h2: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  note: { fontSize: 12, color: theme.textMuted, marginTop: 6, marginBottom: 10, lineHeight: 18 },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },
  empty: { fontSize: 13, color: theme.textMuted, marginTop: 20, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  nameInput: { flex: 1, fontSize: 15, color: theme.textPrimary, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderStrong },
  cat: { fontSize: 11, color: theme.textSecondary, backgroundColor: theme.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  amountInput: { width: 56, fontSize: 13, color: theme.textPrimary, textAlign: 'center', paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.borderStrong, borderRadius: 8 },
  delBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  delMark: { fontSize: 16, color: theme.textMuted },
  addBtn: { marginTop: 14, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.greenText, fontSize: 14, fontWeight: '600' },
  primaryBtn: { backgroundColor: theme.greenFill, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryBtnText: { color: theme.onGreen, fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
