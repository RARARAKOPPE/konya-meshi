import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { Member, Condition, AllergyEntry } from '../types';

const ITEM_OPTIONS = ['卵', '乳', '小麦', 'えび', 'かに', 'そば', '落花生', 'くるみ'];
const GROUP_OPTIONS = ['甲殻類', 'ナッツ', '魚', '果物'];
const CONDITION_OPTIONS: Condition[] = ['妊娠中', '授乳中'];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.chip, on && s.chipOn]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{label}</Text>
    </TouchableOpacity>
  );
}

export function SettingsScreen({
  members,
  onAdd,
  onEdit,
  onDelete,
  onOpenSupport,
  isSupporter,
  purchasesAvailable,
  onBack,
}: {
  members: Member[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onOpenSupport: () => void;
  isSupporter: boolean;
  purchasesAvailable: boolean;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>食べる人</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={s.sub}>一度設定すれば、毎回の提案に自動で反映されます</Text>

      {members.map((m, i) => (
        <View key={m.id} style={s.memberRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.memberName}>{m.label}</Text>
            <View style={s.badges}>
              <Text style={s.memberMeta}>{m.kind === 'child' ? `子ども・${m.childAge ?? 0}歳` : '大人'}</Text>
              {m.conditions.map((c) => (
                <Text key={c} style={[s.badge, s.badgePro]}>{c}</Text>
              ))}
              {m.allergies.map((a) => (
                <Text key={a.value} style={[s.badge, s.badgeDanger]}>{a.value}</Text>
              ))}
            </View>
          </View>
          <TouchableOpacity onPress={() => onEdit(i)} style={{ paddingHorizontal: 8 }}>
            <Text style={s.link}>編集</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(i)} style={{ paddingHorizontal: 4 }}>
            <Text style={s.delete}>削除</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={s.addBtn} activeOpacity={0.8} onPress={onAdd}>
        <Text style={s.addBtnText}>＋ 食べる人を追加</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.supportRow} activeOpacity={0.8} onPress={onOpenSupport}>
        <Text style={s.supportText}>
          アプリを応援する{isSupporter ? '（サポーター登録中）' : purchasesAvailable ? '（広告オフ・投げ銭）' : '（準備中）'}
        </Text>
        <Text style={s.supportArrow}>›</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

export function MemberEditScreen({
  initial,
  onSave,
  onCancel,
}: {
  initial: Member | null;
  onSave: (m: Member) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [kind, setKind] = useState<'adult' | 'child'>(initial?.kind ?? 'adult');
  const [age, setAge] = useState(initial?.childAge != null ? String(initial.childAge) : '');
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [items, setItems] = useState<string[]>(
    (initial?.allergies ?? []).filter((a) => a.type === 'item').map((a) => a.value)
  );
  const [groups, setGroups] = useState<string[]>(
    (initial?.allergies ?? []).filter((a) => a.type === 'group').map((a) => a.value)
  );
  const [frees, setFrees] = useState<string[]>(
    (initial?.allergies ?? []).filter((a) => a.type === 'free').map((a) => a.value)
  );
  const [freeInput, setFreeInput] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = () => {
    const allergies: AllergyEntry[] = [
      ...items.map((v) => ({ type: 'item' as const, value: v })),
      ...groups.map((v) => ({ type: 'group' as const, value: v })),
      ...frees.map((v) => ({ type: 'free' as const, value: v })),
    ];
    onSave({
      id: initial?.id ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label: label.trim() || 'メンバー',
      kind,
      childAge: kind === 'child' ? parseInt(age, 10) || 0 : undefined,
      conditions,
      allergies,
    });
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>{initial ? '編集' : '追加'}</Text>
        <TouchableOpacity onPress={save}>
          <Text style={[s.link, { fontWeight: '600' }]}>保存</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.fieldLabel}>名前</Text>
      <TextInput style={s.input} value={label} onChangeText={setLabel} placeholder="あなた / 妻 / 長女 など" placeholderTextColor={theme.textMuted} />

      <Text style={s.fieldLabel}>区分</Text>
      <View style={s.row}>
        <TouchableOpacity style={[s.seg, kind === 'adult' && s.segOn]} onPress={() => setKind('adult')}>
          <Text style={[s.segText, kind === 'adult' && s.segTextOn]}>大人</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.seg, kind === 'child' && s.segOn]} onPress={() => setKind('child')}>
          <Text style={[s.segText, kind === 'child' && s.segTextOn]}>子ども</Text>
        </TouchableOpacity>
      </View>

      {kind === 'child' && (
        <>
          <Text style={s.fieldLabel}>年齢</Text>
          <TextInput style={s.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="3" placeholderTextColor={theme.textMuted} />
        </>
      )}

      {kind === 'adult' && (
        <>
          <Text style={s.fieldLabel}>体の状態</Text>
          <View style={s.chips}>
            {CONDITION_OPTIONS.map((c) => (
              <Chip key={c} label={c} on={conditions.includes(c)} onPress={() => toggle(conditions, setConditions as any, c)} />
            ))}
          </View>
        </>
      )}

      <Text style={s.fieldLabel}>アレルギー（主要）</Text>
      <View style={s.chips}>
        {ITEM_OPTIONS.map((v) => (
          <Chip key={v} label={v} on={items.includes(v)} onPress={() => toggle(items, setItems, v)} />
        ))}
      </View>

      <Text style={s.fieldLabel}>アレルギー（グループ）</Text>
      <View style={s.chips}>
        {GROUP_OPTIONS.map((v) => (
          <Chip key={v} label={v} on={groups.includes(v)} onPress={() => toggle(groups, setGroups, v)} />
        ))}
      </View>

      <Text style={s.fieldLabel}>その他（自由入力）</Text>
      {frees.length > 0 && (
        <View style={s.chips}>
          {frees.map((v) => (
            <Chip key={v} label={v} on onPress={() => setFrees(frees.filter((x) => x !== v))} />
          ))}
        </View>
      )}
      <View style={[s.row, { marginTop: 8 }]}>
        <TextInput
          style={[s.input, { flex: 1, marginTop: 0 }]}
          value={freeInput}
          onChangeText={setFreeInput}
          placeholder="例：とうもろこし"
          placeholderTextColor={theme.textMuted}
        />
        <TouchableOpacity
          style={s.addInline}
          onPress={() => {
            const v = freeInput.trim();
            if (v && !frees.includes(v)) setFrees([...frees, v]);
            setFreeInput('');
          }}
        >
          <Text style={s.addInlineText}>追加</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.note}>重いアレルギーがある場合は、提案後も材料を必ずご確認ください。アプリはリスクを減らしますが、安全を保証するものではありません。</Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  row: { flexDirection: 'row', gap: 10 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  sub: { fontSize: 12, color: theme.textMuted, marginTop: 4, marginBottom: 8 },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },
  delete: { fontSize: 14, color: '#B23B3B' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  memberName: { fontSize: 15, fontWeight: '500', color: theme.textPrimary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  memberMeta: { fontSize: 12, color: theme.textMuted },
  badge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  badgePro: { backgroundColor: '#EEEDFE', color: '#534AB7' },
  badgeDanger: { backgroundColor: '#FCEBEB', color: '#A32D2D' },

  addBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  addBtnText: { fontSize: 14, color: theme.textSecondary },
  supportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: theme.greenTint },
  supportText: { fontSize: 14, color: theme.greenText, fontWeight: '500' },
  supportArrow: { fontSize: 18, color: theme.greenText },

  fieldLabel: { fontSize: 13, color: theme.textSecondary, marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: theme.textPrimary,
  },
  seg: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: theme.greenFill, borderColor: theme.greenFill },
  segText: { fontSize: 14, color: theme.textSecondary },
  segTextOn: { color: theme.onGreen, fontWeight: '600' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  chipOn: { backgroundColor: theme.greenTint, borderColor: theme.greenFill },
  chipText: { fontSize: 13, color: theme.textSecondary },
  chipTextOn: { color: theme.greenText, fontWeight: '500' },

  addInline: { paddingHorizontal: 16, height: 44, borderRadius: 10, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  addInlineText: { fontSize: 14, color: theme.textPrimary },

  note: { fontSize: 11, color: theme.textMuted, lineHeight: 17, marginTop: 20 },
});
