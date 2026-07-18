import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../theme';
import type { Ingredient, Amount } from '../types';
import { classify } from '../engine/classify';

const AMOUNTS: { key: Amount; label: string }[] = [
  { key: 'enough', label: 'ある' },
  { key: 'low', label: '少なめ' },
  { key: 'empty', label: 'わずか' },
];
const amountLabel = (a: Amount) => AMOUNTS.find((x) => x.key === a)?.label ?? '';

// 種別順で並べる時のカテゴリの並び。
const CATEGORY_ORDER = ['肉', '魚', '卵', '大豆', '野菜', '菌類', '主食', '乳', '調味料', 'その他'];

export function FridgeScreen({
  fridge,
  boardIds,
  onAdd,
  onDelete,
  onToggleBoard,
  onRename,
  onScanPhoto,
  onScanReceipt,
  scanning,
  scanAvailable,
  onBack,
}: {
  fridge: Ingredient[];
  boardIds: string[];
  onAdd: (name: string, amount: Amount) => void;
  onDelete: (id: string) => void;
  onToggleBoard: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onScanPhoto: () => void;
  onScanReceipt: () => void;
  scanning: boolean;
  scanAvailable: boolean; // バックエンド(/extract)未設定なら読み取りUI自体を出さない
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<Amount>('enough');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sortByCat, setSortByCat] = useState(true);

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditText(current);
  };
  const commitEdit = () => {
    if (editingId) onRename(editingId, editText);
    setEditingId(null);
    setEditText('');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const add = () => {
    const v = name.trim();
    if (!v) return;
    onAdd(v, amount);
    setName('');
    setAmount('enough');
  };

  const boardItems = fridge.filter((i) => boardIds.includes(i.id));

  const renderItem = (i: Ingredient) => {
    const on = boardIds.includes(i.id);
    return (
      <View key={i.id} style={s.itemRow}>
        <TouchableOpacity style={s.itemMain} onPress={() => onToggleBoard(i.id)} activeOpacity={0.7}>
          <View style={[s.checkbox, on && s.checkboxOn]}>{on ? <Text style={s.checkboxMark}>✓</Text> : null}</View>
          <Text style={s.itemName}>{i.name}</Text>
          <Text style={s.itemCat}>{classify(i.name).category}</Text>
          <Text style={s.itemAmount}>{amountLabel(i.amount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => startEdit(i.id, i.name)}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={s.editBtn}
        >
          <Text style={s.editMark}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(i.id)} style={{ paddingHorizontal: 6 }}>
          <Text style={s.delete}>削除</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.rowBetween}>
          <TouchableOpacity onPress={onBack}>
            <Text style={s.link}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={s.h2}>冷蔵庫とまな板</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={s.sub}>食材をタップすると「まな板（今日使いたい）」に置けます</Text>

        {/* 読み取りはバックエンド(/extract)が要る。未設定なら押しても必ず失敗するのでUIごと出さない。 */}
        {scanAvailable && (
          <View style={s.scanRow}>
            <TouchableOpacity style={[s.scanBtn, s.scanBtnPrimary]} activeOpacity={0.85} onPress={onScanReceipt} disabled={scanning}>
              <Text style={s.scanBtnPrimaryText}>{scanning ? '読み取り中…' : '🧾 レシートから追加'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scanBtn} activeOpacity={0.85} onPress={onScanPhoto} disabled={scanning}>
              <Text style={s.scanBtnText}>{scanning ? '…' : '📷 写真'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* まな板 */}
        <View style={s.boardBox}>
          <Text style={s.boardTitle}>まな板（今日使いたい食材）</Text>
          {boardItems.length > 0 ? (
            <View style={s.chips}>
              {boardItems.map((i) => (
                <TouchableOpacity key={i.id} style={s.boardChip} onPress={() => onToggleBoard(i.id)}>
                  <Text style={s.boardChipText}>{i.name} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={s.boardEmpty}>何も置かなくてもOK。下の冷蔵庫からタップで追加。</Text>
          )}
        </View>

        {/* 追加 */}
        <Text style={s.fieldLabel}>食材を追加</Text>
        <View style={s.addRow}>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="例：豚こま"
            placeholderTextColor={theme.textMuted}
            onSubmitEditing={add}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.addBtn} onPress={add}>
            <Text style={s.addBtnText}>追加</Text>
          </TouchableOpacity>
        </View>
        <View style={[s.chips, { marginTop: 8 }]}>
          {AMOUNTS.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[s.amountChip, amount === a.key && s.amountChipOn]}
              onPress={() => setAmount(a.key)}
            >
              <Text style={[s.amountChipText, amount === a.key && s.amountChipTextOn]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 冷蔵庫の中身 */}
        <View style={s.listHeader}>
          <Text style={[s.fieldLabel, { marginBottom: 0 }]}>冷蔵庫の中身</Text>
          {fridge.length > 0 && (
            <TouchableOpacity onPress={() => setSortByCat((v) => !v)} style={s.sortToggle}>
              <Text style={s.sortToggleText}>{sortByCat ? '種別順' : '追加順'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {fridge.length === 0 ? (
          <Text style={s.boardEmpty}>まだ登録がありません。上から追加してください。</Text>
        ) : sortByCat ? (
          CATEGORY_ORDER.map((cat) => {
            const items = fridge.filter((i) => classify(i.name).category === cat);
            if (items.length === 0) return null;
            return (
              <View key={cat}>
                <Text style={s.groupHeader}>{cat}</Text>
                {items.map(renderItem)}
              </View>
            );
          })
        ) : (
          fridge.map(renderItem)
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* 名前編集モーダル（下部の食材でもキーボードに隠れない） */}
      <Modal visible={editingId !== null} transparent animationType="fade" onRequestClose={cancelEdit}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={cancelEdit} />
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>名前を編集</Text>
            <TextInput
              style={s.modalInput}
              value={editText}
              onChangeText={setEditText}
              autoFocus
              onSubmitEditing={commitEdit}
              returnKeyType="done"
              placeholder="食材名"
              placeholderTextColor={theme.textMuted}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity onPress={cancelEdit} style={[s.modalBtn, s.modalBtnGhost]}>
                <Text style={s.modalBtnGhostText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitEdit} style={[s.modalBtn, s.modalBtnPrimary]}>
                <Text style={s.modalBtnPrimaryText}>完了</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  sub: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },
  delete: { fontSize: 13, color: '#B23B3B' },
  fieldLabel: { fontSize: 13, color: theme.textSecondary, marginTop: 20, marginBottom: 8 },
  scanRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  scanBtn: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  scanBtnPrimary: { flex: 1, backgroundColor: theme.greenTint, borderColor: theme.greenFill },
  scanBtnText: { fontSize: 14, color: theme.textPrimary },
  scanBtnPrimaryText: { fontSize: 14, color: theme.greenText, fontWeight: '600' },

  boardBox: { backgroundColor: theme.greenTint, borderRadius: 14, padding: 14, marginTop: 14 },
  boardTitle: { fontSize: 14, fontWeight: '600', color: theme.greenText, marginBottom: 8 },
  boardEmpty: { fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  boardChip: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.greenFill, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  boardChipText: { fontSize: 13, color: theme.greenText },

  addRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: theme.textPrimary },
  addBtn: { paddingHorizontal: 18, height: 44, borderRadius: 10, backgroundColor: theme.greenFill, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.onGreen, fontSize: 14, fontWeight: '600' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  amountChipOn: { backgroundColor: theme.greenTint, borderColor: theme.greenFill },
  amountChipText: { fontSize: 13, color: theme.textSecondary },
  amountChipTextOn: { color: theme.greenText, fontWeight: '500' },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  sortToggle: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface },
  sortToggleText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  groupHeader: { fontSize: 12, fontWeight: '600', color: theme.greenText, backgroundColor: theme.greenTint, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, marginTop: 12, marginBottom: 2, overflow: 'hidden' },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: theme.greenFill, borderColor: theme.greenFill },
  checkboxMark: { color: theme.onGreen, fontSize: 13, fontWeight: '700' },
  itemName: { flex: 1, fontSize: 15, color: theme.textPrimary },
  itemCat: { fontSize: 11, color: theme.textSecondary, backgroundColor: theme.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', marginRight: 8 },
  itemAmount: { fontSize: 12, color: theme.textMuted },
  editBtn: { paddingHorizontal: 6 },
  editMark: { fontSize: 15 },

  modalWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 10 },
  modalInput: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.greenFill, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 16, color: theme.textPrimary },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  modalBtn: { paddingHorizontal: 18, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnGhost: { backgroundColor: theme.surfaceAlt },
  modalBtnGhostText: { fontSize: 14, color: theme.textSecondary },
  modalBtnPrimary: { backgroundColor: theme.greenFill },
  modalBtnPrimaryText: { fontSize: 14, color: theme.onGreen, fontWeight: '600' },
});
