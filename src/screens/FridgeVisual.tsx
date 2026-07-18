import React, { useMemo, useRef, useState } from 'react';
import { Dimensions, Image, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { Ingredient } from '../types';
import { classify } from '../engine/classify';
import { FoodIcon } from '../components/FoodIcon';

// 冷蔵庫を画面幅いっぱいに描く（横padding20*2を差し引き、タブレットは上限480）。
const SCREEN_W = Dimensions.get('window').width;
const RIG_W = Math.min(SCREEN_W - 36, 480);
const DOOR_W = Math.round(RIG_W * 0.28);
const BODY_W = RIG_W - DOOR_W - 2;
// タイル/アイコンも幅に比例で拡大（庫内は1行約4個、ドア内は約2個）。
const TILE_W = Math.round(BODY_W / 4.3);
const ICON = Math.round(TILE_W * 0.66);
const TILE_W_SMALL = Math.round(DOOR_W / 2.2);
const ICON_SMALL = Math.round(TILE_W_SMALL * 0.6);
// ドア上下フック飾り：door-top-lip/bottom-lip(600x230)を実寸比率のまま固定pxで描画。
// Image の width:'100%'+aspectRatio は Yoga 側で幅が正しく解決されず巨大化する不具合があったため使わない。
// 幅は「ドアの内側」に合わせる必要がある。styles.door の paddingHorizontal(6)とborderWidth(3)の分だけ
// コンテンツ領域は左右に狭く、DOOR_W をそのまま指定すると 18px はみ出して overflow:hidden で右端が切れる。
const DOOR_PAD_H = 6;
const DOOR_BORDER = 3;
const DOOR_INNER_W = DOOR_W - (DOOR_PAD_H + DOOR_BORDER) * 2;
const DOOR_LIP_H = Math.round(DOOR_INNER_W * (230 / 600));
// 棚の仕切り線：shelf-line-tile(200x28、額縁部分を含まない中央のみ)を固定サイズで必要数だけ並べて埋める。
// 品数で幅が増減しても伸縮させず、タイルの枚数だけを増減させることで崩れを防ぐ。
const SHELF_TILE_W = 60;
const SHELF_TILE_H = Math.round(SHELF_TILE_W * (28 / 200));
const SHELF_TILE_COUNT = Math.ceil(BODY_W / SHELF_TILE_W) + 1;

// 残量タイル：横スワイプ（右→左で減）で残量を変える。左から残量%だけ着色・右はフェード。
function QuantityTile({
  item,
  on,
  onToggleBoard,
  onSetQty,
  small,
}: {
  item: Ingredient;
  on: boolean;
  onToggleBoard: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
  small?: boolean;
}) {
  const unit = item.unit ?? 'count';
  const max = item.qtyMax ?? (unit === 'count' ? 10 : 5);
  const step = unit === 'count' ? 1 : 0.5;
  const PX = 16; // 1ステップあたりのドラッグpx
  const committed = item.qty ?? max;
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef(committed);
  const startRef = useRef(committed);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          startRef.current = item.qty ?? max;
          dragRef.current = startRef.current;
          setDrag(startRef.current);
        },
        onPanResponderMove: (_, g) => {
          let v = startRef.current + Math.round(g.dx / PX) * step;
          v = Math.max(0, Math.min(max, v));
          v = Math.round(v / step) * step;
          dragRef.current = v;
          setDrag(v);
        },
        onPanResponderRelease: () => {
          onSetQty(item.id, dragRef.current);
          setDrag(null);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    [item.id, item.qty, max, step, onSetQty]
  );

  const val = drag ?? committed;
  const pct = max > 0 ? val / max : 0;
  const valText = unit === 'count' ? `${val}` : `${val}`;
  const label = unit === 'count' ? `残${valText}個` : `残${valText}kg`;
  const WRAP_W = small ? TILE_W_SMALL : 50;
  const ICON = small ? ICON_SMALL : 30;

  return (
    <View style={[qs.wrap, { width: WRAP_W }]} {...pan.panHandlers}>
      {drag != null && (
        <View style={qs.bubble}>
          <Text style={qs.bubbleText}>{label}</Text>
        </View>
      )}
      <TouchableOpacity activeOpacity={0.8} onPress={() => onToggleBoard(item.id)} style={[qs.tile, { width: WRAP_W }, on && qs.tileOn]}>
        <View style={[qs.iconBox, { width: ICON, height: ICON }]}>
          <FoodIcon name={item.name} size={ICON} />
          {pct < 1 && <View style={[qs.scrim, { width: ICON * (1 - pct) }]} />}
        </View>
        <Text style={[qs.name, small && s.tileNameDoor, on && qs.nameOn]} numberOfLines={small ? 2 : 1}>
          {item.name}
        </Text>
        <Text style={[qs.qty, small && s.tileNameDoor]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const qs = StyleSheet.create({
  wrap: { width: 50, alignItems: 'center', position: 'relative' },
  bubble: { position: 'absolute', top: -18, backgroundColor: theme.greenFill, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, zIndex: 10 },
  bubbleText: { color: theme.onGreen, fontSize: 11, fontWeight: '700' },
  // 枠は最初から透明で確保しておく。選択時に borderWidth を足すと高さが3px増えて
  // タップのたびに冷蔵庫全体が膨らむため、色だけ変える。
  tile: { width: 50, alignItems: 'center', paddingVertical: 2, borderRadius: 9, borderWidth: 1.5, borderColor: 'transparent' },
  tileOn: { backgroundColor: theme.greenTint, borderColor: theme.greenFill },
  iconBox: { overflow: 'hidden', alignItems: 'flex-start', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: 'rgba(250,250,247,0.7)' },
  name: { fontSize: 9, color: '#5E5E58', marginTop: 1 },
  nameOn: { color: theme.greenText, fontWeight: '600' },
  qty: { fontSize: 9, color: theme.greenText, fontWeight: '600' },
});

// Tile/Shelf/DoorPocket は必ずモジュール直下で定義すること。
// FridgeVisualScreen の中で定義すると、レンダーのたびに関数の識別子が変わり、Reactが
// 「別のコンポーネント」とみなしてツリーごと破棄→再マウントする。結果、食材をタップするたびに
// 全 <Image> が読み込み直され、一瞬アイコンが消える（実機で確認した不具合）。
interface TileCtx {
  boardIds: string[];
  onToggleBoard: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
}

const Tile = ({ item, small, ctx }: { item: Ingredient; small?: boolean; ctx: TileCtx }) => {
  const on = ctx.boardIds.includes(item.id);
  if (item.unit) {
    return <QuantityTile item={item} on={on} onToggleBoard={ctx.onToggleBoard} onSetQty={ctx.onSetQty} small={small} />;
  }
  return (
    <TouchableOpacity
      style={[s.tile, { width: small ? TILE_W_SMALL : TILE_W }, on && s.tileOn]}
      activeOpacity={0.7}
      onPress={() => ctx.onToggleBoard(item.id)}
    >
      <FoodIcon name={item.name} size={small ? ICON_SMALL : ICON} />
      <Text style={[s.tileName, small && s.tileNameDoor, on && s.tileNameOn]} numberOfLines={small ? 2 : 1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );
};

const Shelf = ({ items, ctx }: { items: Ingredient[]; ctx: TileCtx }) =>
  items.length === 0 ? null : (
    <>
      <View style={s.row}>{items.map((i) => <Tile key={i.id} item={i} ctx={ctx} />)}</View>
      <View style={s.shelfLineRow}>
        {Array.from({ length: SHELF_TILE_COUNT }).map((_, i) => (
          <Image
            key={i}
            source={require('../../assets/ui/fridge/shelf-line-tile.png')}
            style={s.shelfLineTile}
            resizeMode="stretch"
          />
        ))}
      </View>
    </>
  );

// ドアの各段。ラベルは枠の中。fill=調味料（余白を吸収して下まで伸びる＝隙間をなくす）
const DoorPocket = ({ label, items, fill, ctx }: { label: string; items: Ingredient[]; fill?: boolean; ctx: TileCtx }) =>
  items.length === 0 ? null : (
    <View style={[s.pocketBox, fill && s.pocketBoxFill]}>
      <Text style={s.pocketLabel}>{label}</Text>
      <View style={[s.pocketItems, fill && s.pocketItemsFill]}>
        {items.map((i) => (
          <Tile key={i.id} item={i} small ctx={ctx} />
        ))}
      </View>
    </View>
  );

export function FridgeVisualScreen({
  fridge,
  boardIds,
  onToggleBoard,
  onSetQty,
  onOpenList,
  onBack,
}: {
  fridge: Ingredient[];
  boardIds: string[];
  onToggleBoard: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
  onOpenList: () => void;
  onBack: () => void;
}) {
  // 常備「調味料」（塩・砂糖・醤油等）だけ画に出さない。
  // assumed は「買い足しリストに出さない」役割も兼ねており、ごはんにも付いている。
  // assumed を一律で除外すると米が冷蔵庫から見えなくなるため、調味料に限定する
  // （ごはん・小麦粉は在庫として見えてよい。買い足しリストには従来どおり出ない）。
  const shown = fridge.filter((i) => {
    const c = classify(i.name);
    return !(c.assumed && c.category === '調味料');
  });
  // 飲み物だが食材としても使う物はドア下段へ
  const DRINK = new Set(['牛乳', '豆乳']);
  const zoneOf = (i: Ingredient): 'cond' | 'egg' | 'drink' | 'meat' | 'dairy' | 'staple' | 'veg' => {
    const c = classify(i.name);
    const canon = c.canonical ?? i.name;
    if (DRINK.has(canon)) return 'drink';
    if (c.category === '卵') return 'egg';
    if (c.category === '調味料') return 'cond';
    if (c.category === '肉' || c.category === '魚') return 'meat';
    if (c.category === '大豆' || c.category === '乳') return 'dairy';
    if (c.category === '主食') return 'staple';
    return 'veg'; // 野菜・菌類・その他(果物)
  };
  const z = (k: ReturnType<typeof zoneOf>) => shown.filter((i) => zoneOf(i) === k);
  const cond = z('cond');
  const egg = z('egg');
  const drink = z('drink');
  const meat = z('meat');
  const dairy = z('dairy');
  const staple = z('staple');
  const veg = z('veg');
  const doorEmpty = cond.length + egg.length + drink.length === 0;

  const tileProps = { boardIds, onToggleBoard, onSetQty };

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={s.h2}>冷蔵庫の中</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={s.sub}>タップで「今日使う」印（緑）を付けられます</Text>

      {shown.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>🧊</Text>
          <Text style={s.emptyText}>まだ何も入っていません。</Text>
          <TouchableOpacity style={s.addBtn} onPress={onOpenList}>
            <Text style={s.addBtnText}>食材を追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.stage}>
          <View style={s.rig}>
            {/* 開いたドア（上＝調味料 / 中＝卵 / 下＝飲み物） */}
            <View style={[s.door, { width: DOOR_W }]}>
              <Image source={require('../../assets/ui/fridge/door-top-lip.png')} style={s.doorLip} resizeMode="cover" />
              {doorEmpty ? (
                <Text style={s.pocketEmpty}>—</Text>
              ) : (
                <>
                  <DoorPocket label="調味料" items={cond} fill ctx={tileProps} />
                  <DoorPocket label="卵" items={egg} ctx={tileProps} />
                  <DoorPocket label="飲み物" items={drink} ctx={tileProps} />
                </>
              )}
              <Image source={require('../../assets/ui/fridge/door-bottom-lip.png')} style={s.doorLip} resizeMode="cover" />
            </View>

            {/* 庫内 */}
            <View style={[s.body, { width: BODY_W }]}>
              <View style={s.cavity}>
                <View style={s.led} />
                <Shelf items={meat} ctx={tileProps} />
                <Shelf items={dairy} ctx={tileProps} />
                <Shelf items={staple} ctx={tileProps} />
                <View style={s.crisper}>
                  <View style={s.crisperSheen} />
                  <View style={s.crisperHandle} />
                  <Text style={s.crisperLabel}>野菜室・果物</Text>
                  <View style={[s.row, { minHeight: 132 }]}>
                    {veg.length === 0 ? (
                      <Text style={s.rowEmpty}>（なし）</Text>
                    ) : (
                      veg.map((i) => <Tile key={i.id} item={i} ctx={tileProps} />)
                    )}
                  </View>
                  <View style={s.crisperLip} />
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {shown.length > 0 && (
        <TouchableOpacity style={s.listLink} onPress={onOpenList}>
          <Text style={s.link}>食材を追加・編集する（一覧）</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  h2: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  sub: { fontSize: 12, color: theme.textMuted, marginTop: 4, marginBottom: 14 },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: theme.textMuted },
  addBtn: { marginTop: 6, paddingHorizontal: 20, height: 46, borderRadius: 12, backgroundColor: theme.greenFill, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.onGreen, fontSize: 15, fontWeight: '600' },

  stage: { alignItems: 'center', paddingBottom: 4 },
  rig: { flexDirection: 'row', alignItems: 'stretch' },

  door: {
    width: 88,
    backgroundColor: '#E8EAE7',
    borderRadius: 14,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: DOOR_PAD_H, // DOOR_INNER_W の計算元。変える時は両方に効く
    borderWidth: DOOR_BORDER,
    borderColor: '#6E4420', // door-top-lip/bottom-lip の額縁と同じ焦茶。上下だけでなく縦の縁も途切れず統一する
    overflow: 'hidden',
    flexDirection: 'column',
    gap: 6,
  },
  // ドアの各段（枠＝ポケット）。ラベルは枠の中。
  pocketBox: { backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: '#C7CAC6', borderBottomWidth: 3, borderBottomColor: '#D4D7D3', borderRadius: 6, paddingTop: 2, paddingBottom: 4, paddingHorizontal: 2 },
  pocketBoxFill: { flex: 1 }, // 調味料＝余白を吸収して下まで伸ばす（隙間解消）
  pocketLabel: { fontSize: 8, color: '#8A8D88', marginLeft: 3, marginBottom: 1, alignSelf: 'flex-start' },
  pocketItems: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'flex-start', gap: 2 },
  pocketItemsFill: { flex: 1, minHeight: 150 }, // 調味料：下まで伸ばす＋最低4行ぶん
  pocketEmpty: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },

  body: { width: 226, backgroundColor: '#E9EBE8', borderRadius: 8, borderTopLeftRadius: 6, borderBottomLeftRadius: 6, padding: 7, borderWidth: 1, borderColor: '#CDD0CC', elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  cavity: { flex: 1, backgroundColor: '#F4F8F9', borderRadius: 10, paddingHorizontal: 6, paddingTop: 7, paddingBottom: 8 },
  // ドア上下の棚フック飾り。固定px（DOOR_W基準で計算済み）で描画し、%+aspectRatioによる崩れを避ける。
  doorLip: { width: DOOR_INNER_W, height: DOOR_LIP_H },
  led: { height: 3, marginHorizontal: 6, marginBottom: 5, borderRadius: 3, backgroundColor: 'rgba(255,243,205,0.9)' },

  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 4, minHeight: 34, paddingHorizontal: 2, paddingBottom: 2 },
  rowEmpty: { fontSize: 11, color: theme.textMuted, paddingVertical: 10 },
  // 実際の棚境目に敷く棚板ライン。固定サイズのタイルを必要枚数だけ並べる（伸縮させない）。
  shelfLineRow: { flexDirection: 'row', width: '100%', height: SHELF_TILE_H, overflow: 'hidden', marginBottom: 7 },
  shelfLineTile: { width: SHELF_TILE_W, height: SHELF_TILE_H },

  crisper: { flex: 1, marginTop: 4, backgroundColor: 'rgba(210,230,224,0.5)', borderWidth: 1, borderColor: 'rgba(150,175,180,0.6)', borderRadius: 8, paddingTop: 18, paddingHorizontal: 4, paddingBottom: 14, position: 'relative', overflow: 'hidden' },
  crisperSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 12, backgroundColor: 'rgba(255,255,255,0.35)' },
  crisperHandle: { position: 'absolute', top: 6, alignSelf: 'center', width: 60, height: 6, borderRadius: 4, backgroundColor: 'rgba(150,175,170,0.8)' },
  crisperLabel: { position: 'absolute', top: 5, right: 10, fontSize: 9, color: '#587068' },
  crisperLip: { position: 'absolute', left: 8, right: 8, bottom: 5, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: 'rgba(150,175,180,0.5)' },

  // 枠は最初から透明で確保しておく（qs.tile と同じ理由。選択時に足すとレイアウトが動く）。
  tile: { width: 42, alignItems: 'center', paddingVertical: 2, paddingHorizontal: 1, borderRadius: 9, borderWidth: 1.5, borderColor: 'transparent' },
  tileSmall: { width: 34 },
  tileOn: { backgroundColor: theme.greenTint, borderColor: theme.greenFill },
  tileName: { fontSize: 9, color: '#5E5E58', marginTop: 1, textAlign: 'center' },
  tileNameDoor: { fontSize: 8 }, // ドアは折り返し可・拡大なし（重なり防止）
  tileNameOn: { color: theme.greenText, fontWeight: '600' },

  listLink: { paddingVertical: 16, alignItems: 'center' },
});
