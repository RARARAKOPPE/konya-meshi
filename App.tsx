import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme, type Fatigue } from './src/theme';
import { decide, decideButtonLabel, type DecideResult } from './src/engine/decide';
import { getSuggestions } from './src/engine/propose';
import { logPick } from './src/engine/analytics';
import { scaleMaterials } from './src/engine/scaleMaterials';
import { pickKobachi } from './src/engine/kobachi';
import { resolveSafetyProfile, summarizeExclusions } from './src/engine/safety';
import { SettingsScreen, MemberEditScreen } from './src/screens/Settings';
import { SupportScreen } from './src/screens/Support';
import { initPurchases, purchaseSupporter, purchaseTip, purchasesAvailable, restorePurchases, type TipTier } from './src/engine/purchases';
import * as ImagePicker from 'expo-image-picker';
import { FridgeScreen } from './src/screens/Fridge';
import { FridgeVisualScreen } from './src/screens/FridgeVisual';
import { HistoryScreen } from './src/screens/History';
import { ExtractReviewScreen } from './src/screens/ExtractReview';
import { extractFromImage, type ExtractedItem } from './src/engine/extract';
import { classify } from './src/engine/classify';
import type { Member, Ingredient, Amount, Recipe, MealHistory } from './src/types';
import { loadMembers, saveMembers } from './src/storage/members';
import { loadFridge, saveFridge } from './src/storage/fridge';
import { loadHistory, saveHistory } from './src/storage/history';
import { computeDeficits, mealCategories, dinnerDate } from './src/engine/nutrition';
import { canShowAd } from './src/engine/ads';
import { loadAdState, saveAdState, type AdState } from './src/storage/ads';

// 残量管理する食材の初期値（卵=10個 / 米=5kg）
function defaultQuantity(name: string): Partial<Ingredient> {
  const canon = classify(name).canonical;
  if (canon === '卵') return { unit: 'count', qtyMax: 10, qty: 10 };
  if (canon === '米') return { unit: 'kg', qtyMax: 5, qty: 5 };
  return {};
}

// OCRで読めた数量(例:"10個","5kg")を卵/米の残量に反映。読めなければ既定値。
function quantityFromAmount(name: string, amount?: string | null): Partial<Ingredient> {
  const base = defaultQuantity(name);
  if (!amount) return base;
  const canon = classify(name).canonical;
  const num = parseFloat((amount.match(/[\d.]+/) ?? [])[0] ?? '');
  if (!isFinite(num) || num <= 0) return base;
  if (canon === '卵' && /個/.test(amount)) return { unit: 'count', qtyMax: Math.max(Math.round(num), 1), qty: Math.round(num) };
  if (canon === '米' && /kg|ｋｇ|キロ/i.test(amount)) return { unit: 'kg', qtyMax: Math.max(num, 1), qty: num };
  return base;
}

type Screen =
  | 'fatigue'
  | 'main'
  | 'result'
  | 'done'
  | 'settings'
  | 'memberEdit'
  | 'fridge'
  | 'fridgeVisual'
  | 'materials'
  | 'history'
  | 'support'
  | 'extract';

const DIRECTION_TAGS = [
  '今日を乗り切る',
  '時短',
  'レンジ併用',
  '包丁なし',
  '洗い物少なめ',
  '栄養優先',
  '子ども完食',
  '冷蔵庫整理',
  '節約',
];

// 「フライパンひとつ」を「フライパン / ひとつ」と語の切れ目で改行させる
function formatWashUp(s: string): string {
  return s.replace('ひとつ', '\nひとつ');
}

// 疲労度で自動点灯する方向性タグ（設計書 §4②）
function defaultTags(f: Fatigue): string[] {
  switch (f) {
    case '限界':
      return ['今日を乗り切る', '時短', '洗い物少なめ'];
    case '疲れた':
      return ['時短', '洗い物少なめ'];
    default:
      return [];
  }
}

const MAX_ALTS = 3; // 別の案は最大3回（設計書 §3）

const FATIGUE_OPTIONS: { key: Fatigue; emoji: string; sub: string }[] = [
  { key: '元気', emoji: '💪', sub: 'しっかり作れる' },
  { key: '普通', emoji: '🙂', sub: 'そこそこやれる' },
  { key: '疲れた', emoji: '😮‍💨', sub: '最小限にしたい' },
  { key: '限界', emoji: '🫠', sub: 'もう決めて' },
];

// デモ用の初期メンバー（本番はオンボーディングで設定。未設定時は安全側に倒す方針 §14）
const DEFAULT_MEMBERS: Member[] = [
  { id: 'u', label: 'あなた', kind: 'adult', conditions: [], allergies: [] },
  { id: 'w', label: '妻', kind: 'adult', conditions: ['妊娠中'], allergies: [] },
  { id: 'c', label: '長女', kind: 'child', childAge: 3, conditions: [], allergies: [{ type: 'item', value: 'えび' }] },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('fatigue');
  const [fatigue, setFatigue] = useState<Fatigue>('限界');
  const [results, setResults] = useState<DecideResult[]>([]);
  const [chosen, setChosen] = useState<DecideResult | null>(null);
  const [materialRecipe, setMaterialRecipe] = useState<Recipe | null>(null);
  const [shownTitles, setShownTitles] = useState<string[]>([]);
  const [altCount, setAltCount] = useState(0);

  const [members, setMembers] = useState<Member[]>(DEFAULT_MEMBERS);
  const [editIndex, setEditIndex] = useState<number | null>(null); // null = 新規
  const [fridgeReturn, setFridgeReturn] = useState<Screen>('main');
  const openFridge = (from: Screen) => {
    setFridgeReturn(from);
    setScreen('fridge');
  };

  // 食べる人を端末内から復元 → 変更時に保存（健康情報はクラウドに置かない・§7）
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    loadMembers().then((m) => {
      if (m) setMembers(m);
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (hydrated) saveMembers(members);
  }, [members, hydrated]);

  // 今夜食べる人（一時・既定は全員オン。メンバー変更時は全員に戻す ≒ 毎日全員リセット §4.5）
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map((m) => m.id));
  useEffect(() => {
    setSelectedIds(members.map((m) => m.id));
  }, [members]);
  const tonightMembers = members.filter((m) => selectedIds.includes(m.id));
  const toggleEater = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // 冷蔵庫（永続）・まな板（当夜）・方向性タグ（当夜・疲労度で自動点灯）
  const [fridge, setFridge] = useState<Ingredient[]>([]);
  const [fridgeHydrated, setFridgeHydrated] = useState(false);
  useEffect(() => {
    loadFridge().then((f) => {
      if (f) setFridge(f);
      setFridgeHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (fridgeHydrated) saveFridge(fridge);
  }, [fridge, fridgeHydrated]);

  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [directionTags, setDirectionTags] = useState<string[]>([]);

  const addIngredient = (name: string, amount: Amount) =>
    setFridge((fs) => [
      ...fs,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, amount, ...defaultQuantity(name) },
    ]);
  const deleteIngredient = (id: string) => {
    setFridge((fs) => fs.filter((i) => i.id !== id));
    setBoardIds((b) => b.filter((x) => x !== id));
  };
  const toggleBoard = (id: string) =>
    setBoardIds((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  // 卵=10個 / 米=5kg を残量管理の初期値として付与（それ以外は管理なし）
  const setQty = (id: string, qty: number) =>
    setFridge((fs) => fs.map((i) => (i.id === id ? { ...i, qty: Math.max(0, Math.min(i.qtyMax ?? qty, qty)) } : i)));
  const toggleTag = (t: string) =>
    setDirectionTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  // 食育履歴（永続。栄養偏り判定の元データ）
  const [history, setHistory] = useState<MealHistory[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  useEffect(() => {
    loadHistory().then((h) => {
      if (h) setHistory(h);
      setHistoryHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (historyHydrated) saveHistory(history);
  }, [history, historyHydrated]);

  // 課金：本番デフォルトでは無効。開発時のみ EXPO_PUBLIC_PURCHASES_MODE=mock で動かす。
  const [isSupporter, setIsSupporter] = useState(false);
  const hasPurchases = purchasesAvailable();
  useEffect(() => {
    initPurchases().then((e) => setIsSupporter(e.supporter));
  }, []);
  const subscribeSupporter = async () => {
    try {
      const e = await purchaseSupporter();
      setIsSupporter(e.supporter);
      Alert.alert('ありがとうございます', 'サポーター登録が完了しました。広告は表示されません。');
    } catch {
      Alert.alert('準備中です', 'サポーター登録は本番課金の接続後に使えるようになります。');
    }
  };
  const tip = async (tier: TipTier) => {
    try {
      await purchaseTip(tier);
      Alert.alert('ありがとうございます ☕', `¥${tier} の応援、励みになります！`);
    } catch {
      Alert.alert('準備中です', '投げ銭は本番課金の接続後に使えるようになります。');
    }
  };
  const restore = async () => {
    try {
      const e = await restorePurchases();
      setIsSupporter(e.supporter);
      Alert.alert('復元しました', e.supporter ? 'サポーター登録を復元しました。' : '復元できる購入はありませんでした。');
    } catch {
      Alert.alert('復元できませんでした', '時間をおいて再度お試しください。');
    }
  };

  // 広告：疲労度ゲート＋1日上限（決定後の調理画面でのみ表示）
  const [adState, setAdState] = useState<AdState>({ date: dinnerDate(), count: 0 });
  const [adHydrated, setAdHydrated] = useState(false);
  const [showAd, setShowAd] = useState(false);
  useEffect(() => {
    loadAdState().then((a) => {
      const today = dinnerDate();
      setAdState(a && a.date === today ? a : { date: today, count: 0 });
      setAdHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (adHydrated) saveAdState(adState);
  }, [adState, adHydrated]);

  const recordMeal = (recipe: Recipe) => {
    const dd = dinnerDate();
    const entry: MealHistory = {
      id: dd,
      title: recipe.title,
      dinnerDate: dd,
      cookedAt: Date.now(),
      categories: mealCategories(recipe.usedIngredients.map((i) => i.name)),
      fatigueAtCook: fatigue,
    };
    setHistory((prev) => [...prev.filter((m) => m.dinnerDate !== dd), entry]); // 同日は上書き
  };

  const [loading, setLoading] = useState(false);

  const runSuggests = async (avoid: string[]): Promise<DecideResult[]> => {
    setLoading(true);
    const boardNames = fridge.filter((i) => boardIds.includes(i.id)).map((i) => i.name);
    const { results: rs } = await getSuggestions({
      fatigue,
      members: tonightMembers,
      cuttingBoard: boardNames,
      fridge,
      directionTags,
      nutritionDeficits: computeDeficits(history).deficits,
      avoidTitles: avoid,
    });
    setLoading(false);
    if (rs.length === 0) {
      Alert.alert(
        '安全に出せる候補がありません',
        '今の食べる人の設定では、安全に提案できる料理が見つかりませんでした。設定を見直すか、手動で選んでください。'
      );
      return [];
    }
    setResults(rs);
    return rs;
  };

  // 即時表示パターン（レイテンシ体感ゼロ）:
  //  決定時に(1)ローカルfallbackをまな板優先で即表示し、(2)裏でAIを発火しておく。
  //  「別の案」初回でその裏のAI結果に差し替える（ユーザーが初回案を見ている数秒で完了済み）。
  const aiPromiseRef = useRef<Promise<DecideResult[]> | null>(null);
  const aiShownRef = useRef(false);

  const startBackgroundAI = (avoid: string[]) => {
    aiShownRef.current = false;
    const boardNames = fridge.filter((i) => boardIds.includes(i.id)).map((i) => i.name);
    aiPromiseRef.current = getSuggestions({
      fatigue,
      members: tonightMembers,
      cuttingBoard: boardNames,
      fridge,
      directionTags,
      nutritionDeficits: computeDeficits(history).deficits,
      avoidTitles: avoid,
    })
      .then((o) => o.results)
      .catch(() => []);
  };

  const onDecide = async () => {
    const boardNames = fridge.filter((i) => boardIds.includes(i.id)).map((i) => i.name);
    // (1) ローカルfallbackを即時表示（0秒・まな板優先）
    const instant = decide({
      fatigue,
      members: tonightMembers,
      cuttingBoard: boardNames,
      nutritionDeficits: computeDeficits(history).deficits,
      headcount: tonightMembers.length,
    });
    // (2) 裏でAIを先行取得（初回案は重複させない）
    startBackgroundAI(instant ? [instant.recipe.title] : []);

    if (instant) {
      setResults([instant]);
      setShownTitles([instant.recipe.title]);
      setAltCount(0);
      setScreen('result');
      return;
    }
    // fallbackが無いレアケースはAIを待つ従来動作
    const rs = await runSuggests([]);
    if (rs.length === 0) return;
    setShownTitles(rs.map((r) => r.recipe.title));
    setAltCount(0);
    setScreen('result');
  };

  const onAnother = async () => {
    if (altCount >= MAX_ALTS || loading) return;
    // 初回の「別の案」= 裏で取得済みのAI結果に差し替え
    if (!aiShownRef.current && aiPromiseRef.current) {
      setLoading(true);
      const ai = await aiPromiseRef.current;
      aiShownRef.current = true;
      const fresh = ai.filter((r) => !shownTitles.includes(r.recipe.title));
      setLoading(false);
      if (fresh.length > 0) {
        setResults(fresh);
        setShownTitles((prev) => [...prev, ...fresh.map((r) => r.recipe.title)]);
        setAltCount((c) => c + 1);
        return;
      }
      // AIが空/全重複なら以降のfallback取得へフォールスルー
    }
    // 2回目以降（またはAI無し）: 新規候補を取得
    const rs = await runSuggests(shownTitles);
    if (rs.length === 0) return;
    setShownTitles((prev) => [...prev, ...rs.map((r) => r.recipe.title)]);
    setAltCount((c) => c + 1);
  };

  const chooseRecipe = (r: DecideResult) => {
    setChosen(r);
    recordMeal(r.recipe);
    // 人気レシピ集計の匿名ログ（健康情報は送らない・失敗無視）。idの ai- 接頭辞で出所を判定。
    logPick({
      result: r,
      source: r.id.startsWith('ai-') ? 'ai' : 'fallback',
      fatigue,
      categories: mealCategories(r.recipe.usedIngredients.map((i) => i.name)),
    });
    // 決定後にだけ広告判定（限界=0・1日上限・サポーターはオフ）
    const today = dinnerDate();
    const todayCount = adState.date === today ? adState.count : 0;
    const show = canShowAd({ fatigue, isSupporter, todayCount });
    setShowAd(show);
    if (show) setAdState({ date: today, count: todayCount + 1 });
    else if (adState.date !== today) setAdState({ date: today, count: 0 });
    setScreen('done');
  };
  const openMaterials = (recipe: Recipe) => {
    setMaterialRecipe(recipe);
    setScreen('materials');
  };

  // 写真/レシートから食材を取り込む（Claude Vision・§5冷蔵庫登録）
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [scanMode, setScanMode] = useState<'fridge' | 'receipt'>('fridge');

  const renameIngredient = (id: string, name: string) => {
    const v = name.trim();
    if (!v) return;
    setFridge((fs) => fs.map((i) => (i.id === id ? { ...i, name: v } : i)));
  };

  const addManyToFridge = (picked: { name: string; amount?: string | null }[]) => {
    const created = picked.map(({ name, amount }) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${name}`,
      name,
      amount: 'enough' as Amount,
      ...quantityFromAmount(name, amount),
    }));
    setFridge((fs) => [...fs, ...created]);
  };

  const scan = async (mode: 'fridge' | 'receipt') => {
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      let result: ImagePicker.ImagePickerResult;
      if (cam.granted) {
        result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.4 });
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          Alert.alert('権限が必要です', 'カメラまたは写真へのアクセスを許可してください。');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.4 });
      }
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.base64) return;
      setLoading(true);
      const raw = await extractFromImage(asset.base64, asset.mimeType ?? 'image/jpeg', mode);
      setLoading(false);
      // 辞書スナップ: 商品名→一般名(canonical)に寄せ、カテゴリは辞書を正にする。重複は除去。
      const seen = new Set<string>();
      const snapped: ExtractedItem[] = [];
      for (const it of raw) {
        const c = classify(it.name);
        const name = c.matched && c.canonical ? c.canonical : it.name;
        if (seen.has(name)) continue;
        seen.add(name);
        snapped.push({ name, category: c.matched ? c.category : it.category, amount: it.amount ?? null });
      }
      setExtracted(snapped);
      setScanMode(mode);
      setScreen('extract');
    } catch {
      setLoading(false);
      Alert.alert('読み取りに失敗しました', 'AIサーバに接続できないか、画像を認識できませんでした。手入力もできます。');
    }
  };

  const reset = () => {
    setResults([]);
    setChosen(null);
    setMaterialRecipe(null);
    setShownTitles([]);
    setAltCount(0);
    aiPromiseRef.current = null;
    aiShownRef.current = false;
    setShowAd(false);
    setScreen('fatigue');
  };

  // 「ごちそうさま」→ホームの間に、余裕のある人(普通/元気)だけ全画面広告を挟む。
  // 放っておけば数秒で自動的にホームへ戻る。サポーター・限界/疲れた・上限超過では出さない。
  const [showFullAd, setShowFullAd] = useState(false);
  const onFinish = () => {
    const today = dinnerDate();
    const todayCount = adState.date === today ? adState.count : 0;
    const eligible =
      (fatigue === '普通' || fatigue === '元気') && canShowAd({ fatigue, isSupporter, todayCount });
    if (eligible) {
      setAdState({ date: today, count: todayCount + 1 });
      setShowFullAd(true);
    } else {
      reset();
    }
  };
  const closeFullAd = () => {
    setShowFullAd(false);
    reset();
  };

  // ＋1小鉢：メインに足すもう一品。誰が食べるか未確定の初期画面では、
  // 安全側に倒して「全員のアレルギー等」で除外する（tonightに選択があればそれを優先）。
  const [kobachi, setKobachi] = useState<DecideResult | null>(null);
  const addKobachi = () => {
    const eaters = tonightMembers.length ? tonightMembers : members;
    const k = pickKobachi(eaters, kobachi?.recipe.title);
    if (!k) {
      Alert.alert('小鉢が見つかりません', '今の食べる人の設定では、安全に出せる小鉢がありませんでした。');
      return;
    }
    setKobachi(k);
  };

  // 設定まわり
  const openSettings = () => setScreen('settings');
  const addMember = () => {
    setEditIndex(null);
    setScreen('memberEdit');
  };
  const editMember = (i: number) => {
    setEditIndex(i);
    setScreen('memberEdit');
  };
  const deleteMember = (i: number) => setMembers((ms) => ms.filter((_, idx) => idx !== i));
  const saveMember = (m: Member) => {
    setMembers((ms) => (editIndex == null ? [...ms, m] : ms.map((x, idx) => (idx === editIndex ? m : x))));
    setScreen('settings');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {screen === 'fatigue' && (
        <FatigueScreen
          onSelect={(f) => {
            setFatigue(f);
            setDirectionTags(defaultTags(f));
            setScreen('main');
          }}
          onOpenFridge={() => openFridge('fatigue')}
          onOpenFridgeVisual={() => setScreen('fridgeVisual')}
          onAddKobachi={addKobachi}
        />
      )}
      {screen === 'main' && (
        <MainScreen
          fatigue={fatigue}
          members={members}
          selectedIds={selectedIds}
          onToggleEater={toggleEater}
          fridge={fridge}
          boardIds={boardIds}
          directionTags={directionTags}
          onToggleTag={toggleTag}
          onOpenFridge={() => openFridge('main')}
          onOpenHistory={() => setScreen('history')}
          loading={loading}
          onChange={() => setScreen('fatigue')}
          onOpenSettings={openSettings}
          onDecide={onDecide}
        />
      )}
      {screen === 'result' && results.length > 0 && (
        <ResultScreen
          results={results}
          altsLeft={MAX_ALTS - altCount}
          loading={loading}
          onAnother={onAnother}
          onChoose={chooseRecipe}
          onMaterials={openMaterials}
          onBack={() => setScreen('main')}
        />
      )}
      {screen === 'done' && chosen && <DoneScreen result={chosen} showAd={showAd} onReset={onFinish} />}
      {screen === 'materials' && materialRecipe && (
        <MaterialsScreen
          recipe={materialRecipe}
          headcount={tonightMembers.length}
          showSafetyBanner={summarizeExclusions(resolveSafetyProfile(tonightMembers)).length > 0}
          onChoose={() => chooseRecipe({ id: `m-${materialRecipe.title}`, recipe: materialRecipe })}
          onBack={() => setScreen('result')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          members={members}
          onAdd={addMember}
          onEdit={editMember}
          onDelete={deleteMember}
          onOpenSupport={() => setScreen('support')}
          isSupporter={isSupporter}
          purchasesAvailable={hasPurchases}
          onBack={() => setScreen('main')}
        />
      )}
      {screen === 'support' && (
        <SupportScreen
          isSupporter={isSupporter}
          onSubscribe={subscribeSupporter}
          onTip={tip}
          onRestore={restore}
          purchasesAvailable={hasPurchases}
          onBack={() => setScreen('settings')}
        />
      )}
      {screen === 'memberEdit' && (
        <MemberEditScreen
          initial={editIndex == null ? null : members[editIndex]}
          onSave={saveMember}
          onCancel={() => setScreen('settings')}
        />
      )}
      {screen === 'fridge' && (
        <FridgeScreen
          fridge={fridge}
          boardIds={boardIds}
          onAdd={addIngredient}
          onDelete={deleteIngredient}
          onToggleBoard={toggleBoard}
          onRename={renameIngredient}
          onScanPhoto={() => scan('fridge')}
          onScanReceipt={() => scan('receipt')}
          scanning={loading}
          onBack={() => setScreen(fridgeReturn)}
        />
      )}
      {screen === 'fridgeVisual' && (
        <FridgeVisualScreen
          fridge={fridge}
          boardIds={boardIds}
          onToggleBoard={toggleBoard}
          onSetQty={setQty}
          onOpenList={() => openFridge('fridgeVisual')}
          onBack={() => setScreen('fatigue')}
        />
      )}
      {screen === 'history' && <HistoryScreen history={history} onBack={() => setScreen('main')} />}
      {screen === 'extract' && (
        <ExtractReviewScreen
          items={extracted}
          mode={scanMode}
          onConfirm={(picked) => {
            addManyToFridge(picked);
            setScreen('fridge');
          }}
          onCancel={() => setScreen('fridge')}
        />
      )}
      <FullScreenAdModal visible={showFullAd} onClose={closeFullAd} />
      <KobachiModal kobachi={kobachi} onReroll={addKobachi} onClose={() => setKobachi(null)} />
    </SafeAreaView>
  );
}

function KobachiModal({
  kobachi,
  onReroll,
  onClose,
}: {
  kobachi: DecideResult | null;
  onReroll: () => void;
  onClose: () => void;
}) {
  const r = kobachi?.recipe;
  return (
    <Modal visible={!!kobachi} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.kbOverlay}>
        <View style={styles.kbCard}>
          <Text style={styles.kbLabel}>もう一品の小鉢</Text>
          <Text style={styles.kbTitle}>{r?.title}</Text>
          {r?.reason ? <Text style={styles.kbReason}>{r.reason}</Text> : null}
          {r?.steps?.map((s, i) => (
            <View key={i} style={styles.kbStepRow}>
              <Text style={styles.kbStepNum}>{i + 1}</Text>
              <Text style={styles.kbStepText}>{s}</Text>
            </View>
          ))}
          {r?.childNote ? <Text style={styles.kbChildNote}>※ {r.childNote}</Text> : null}
          <View style={styles.kbBtnRow}>
            <TouchableOpacity style={styles.kbGhostBtn} activeOpacity={0.8} onPress={onReroll}>
              <Text style={styles.kbGhostText}>別の小鉢</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.kbCloseBtn} activeOpacity={0.85} onPress={onClose}>
              <Text style={styles.kbCloseText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FatigueScreen({
  onSelect,
  onOpenFridge,
  onOpenFridgeVisual,
  onAddKobachi,
}: {
  onSelect: (f: Fatigue) => void;
  onOpenFridge: () => void;
  onOpenFridgeVisual: () => void;
  onAddKobachi: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: 24 }}>
        <Text style={styles.h1}>おかえりなさい。{'\n'}今日はどれくらい疲れてる？</Text>
        <Text style={styles.sub}>まずこれだけ選んでください</Text>
      </View>
      <View style={styles.grid}>
        {FATIGUE_OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.key}
            style={[styles.fatigueCard, o.key === '限界' && styles.fatigueCardLimit]}
            activeOpacity={0.8}
            onPress={() => onSelect(o.key)}
          >
            <Text style={styles.fatigueEmoji}>{o.emoji}</Text>
            <Text style={[styles.fatigueLabel, o.key === '限界' && styles.greenTextStrong]}>{o.key}</Text>
            <Text style={styles.fatigueSub}>{o.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={onAddKobachi} style={styles.kobachiBtn} activeOpacity={0.85}>
        <Text style={styles.kobachiBtnText}>＋ 小鉢をもう一品</Text>
        <Text style={styles.kobachiBtnSub}>彩り・副菜が欲しい時に</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onOpenFridgeVisual} style={styles.fridgeViewBtn} activeOpacity={0.85}>
        <Text style={styles.fridgeViewEmoji}>🧊</Text>
        <Text style={styles.fridgeViewText}>冷蔵庫の中を見る</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onOpenFridge} style={{ paddingVertical: 10, alignItems: 'center' }}>
        <Text style={styles.link}>食材を確認・追加（一覧）</Text>
      </TouchableOpacity>
    </View>
  );
}

function MainScreen({
  fatigue,
  members,
  selectedIds,
  onToggleEater,
  loading,
  onChange,
  onOpenSettings,
  onDecide,
  fridge,
  boardIds,
  directionTags,
  onToggleTag,
  onOpenFridge,
  onOpenHistory,
}: {
  fatigue: Fatigue;
  members: Member[];
  selectedIds: string[];
  onToggleEater: (id: string) => void;
  fridge: Ingredient[];
  boardIds: string[];
  directionTags: string[];
  onToggleTag: (t: string) => void;
  onOpenFridge: () => void;
  onOpenHistory: () => void;
  loading: boolean;
  onChange: () => void;
  onOpenSettings: () => void;
  onDecide: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tonight = members.filter((m) => selectedIds.includes(m.id));
  const exclusions = summarizeExclusions(resolveSafetyProfile(tonight));
  const collapsed = fatigue === '限界' && !expanded;
  const noneSelected = tonight.length === 0;
  const boardItems = fridge.filter((i) => boardIds.includes(i.id));

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.rowBetween}>
          <View style={styles.fatigueBadge}>
            <Text style={styles.fatigueBadgeText}>{fatigue}モード</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={onOpenHistory}>
              <Text style={styles.link}>履歴</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onChange}>
              <Text style={styles.link}>変更</Text>
            </TouchableOpacity>
          </View>
        </View>

        {collapsed ? (
          <View style={styles.eaterBox}>
            <View style={styles.collapsedRow}>
              <Text style={styles.collapsedText}>家族{tonight.length}人ぶんで決めます</Text>
              <TouchableOpacity onPress={() => setExpanded(true)}>
                <Text style={styles.link}>変える ›</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.collapsedNote}>アレルギー・妊娠中の配慮はそのまま効いています</Text>
          </View>
        ) : (
          <>
            <View style={styles.eaterBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.eaterTitle}>今夜食べる人 {tonight.length}人</Text>
                <TouchableOpacity onPress={onOpenSettings}>
                  <Text style={styles.link}>設定</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eaterChips}>
                {members.map((m) => {
                  const on = selectedIds.includes(m.id);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.eaterChip, !on && styles.eaterChipDim]}
                      activeOpacity={0.8}
                      onPress={() => onToggleEater(m.id)}
                    >
                      <View>
                        <View style={[styles.avatar, on && styles.avatarOn]}>
                          <Text style={[styles.avatarInitial, on && styles.avatarInitialOn]}>{m.label.slice(0, 1)}</Text>
                        </View>
                        {on && (
                          <View style={styles.checkBadge}>
                            <Text style={styles.checkBadgeText}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.eaterName} numberOfLines={1}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {exclusions.length > 0 ? (
                <View style={styles.exclWrap}>
                  <Text style={styles.exclLabel}>自動で除外：</Text>
                  {exclusions.map((e) => (
                    <View key={e} style={styles.exclChip}>
                      <Text style={styles.exclChipText}>{e}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.exclNone}>全員そのまま食べられます</Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>
              どんな方向性で？<Text style={styles.muted}>　任意</Text>
            </Text>
            <View style={styles.chips}>
              {DIRECTION_TAGS.map((t) => {
                const on = directionTags.includes(t);
                return (
                  <TouchableOpacity key={t} style={[styles.tagChip, on && styles.tagChipOn]} onPress={() => onToggleTag(t)}>
                    <Text style={[styles.tagText, on && styles.tagTextOn]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.rowBetween, { marginTop: 18 }]}>
              <Text style={[styles.sectionLabel, { marginTop: 0 }]}>まな板</Text>
              <TouchableOpacity onPress={onOpenFridge}>
                <Text style={styles.link}>冷蔵庫を開く</Text>
              </TouchableOpacity>
            </View>
            {boardItems.length > 0 ? (
              <View style={styles.chips}>
                {boardItems.map((i) => (
                  <View key={i.id} style={styles.chip}>
                    <Text style={styles.chipText}>{i.name}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.exclNone}>食材は置かなくてもOK（冷蔵庫から選べます）</Text>
            )}
          </>
        )}
      </ScrollView>

      <Text style={styles.hint}>{noneSelected ? '食べる人を1人以上選んでください' : '在庫が空でも決められます'}</Text>
      <TouchableOpacity
        style={[styles.primaryBtn, (loading || noneSelected) && styles.btnDisabled]}
        activeOpacity={0.85}
        onPress={onDecide}
        disabled={loading || noneSelected}
      >
        <Text style={styles.primaryBtnText}>{loading ? '決めています…' : decideButtonLabel(fatigue)}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ResultScreen({
  results,
  altsLeft,
  loading,
  onAnother,
  onChoose,
  onMaterials,
  onBack,
}: {
  results: DecideResult[];
  altsLeft: number;
  loading: boolean;
  onAnother: () => void;
  onChoose: (r: DecideResult) => void;
  onMaterials: (recipe: Recipe) => void;
  onBack: () => void;
}) {
  const hero = results[0];
  const others = results.slice(1);
  const r = hero.recipe;
  const multi = results.length > 1;
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>{multi ? '今日の候補' : '今日の提案'}</Text>
        <View style={{ width: 44 }} />
      </View>
      {multi && <Text style={[styles.muted, { marginTop: 6 }]}>おすすめ＋他の候補から選べます</Text>}

      <View style={[multi && styles.heroCardAccent]}>
        {multi && (
          <View style={styles.recommendBadge}>
            <Text style={styles.recommendBadgeText}>おすすめ</Text>
          </View>
        )}
        <View style={styles.photo}>
          <Text style={{ fontSize: 44 }}>🍚</Text>
        </View>
        <Text style={styles.title}>{r.title}</Text>
        <View style={styles.metrics}>
          <Metric value={`${r.cookTimeMinutes}分`} label="所要時間" />
          <Metric value={formatWashUp(r.washUp)} label="洗い物" />
          <Metric value={r.childFriendly ? '取り分け可' : '大人向け'} label="子ども" />
        </View>
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>{r.reason}</Text>
        </View>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10, height: 52 }]} activeOpacity={0.85} onPress={() => onChoose(hero)}>
          <Text style={styles.primaryBtnText}>これにする</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={() => onMaterials(r)}>
          <Text style={styles.secondaryBtnText}>材料を見る</Text>
        </TouchableOpacity>
      </View>

      {others.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>他の候補</Text>
          {others.map((o) => (
            <View key={o.id} style={styles.candidateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.candidateTitle}>{o.recipe.title}</Text>
                <Text style={styles.candidateMeta}>
                  {o.recipe.cookTimeMinutes}分 ・ {o.recipe.washUp}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onMaterials(o.recipe)} style={{ paddingHorizontal: 8 }}>
                <Text style={styles.link}>材料</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickBtn} onPress={() => onChoose(o)}>
                <Text style={styles.pickBtnText}>選ぶ</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {altsLeft > 0 ? (
        <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 16 }]} activeOpacity={0.8} onPress={onAnother} disabled={loading}>
          <Text style={styles.secondaryBtnText}>
            {loading ? '考えています…' : `${multi ? '別の候補' : '別の案'}（残り${altsLeft}）`}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.cutoff}>今日はこの中から選んでください</Text>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function MaterialsScreen({
  recipe,
  headcount,
  showSafetyBanner,
  onChoose,
  onBack,
}: {
  recipe: Recipe;
  headcount: number;
  showSafetyBanner: boolean;
  onChoose: () => void;
  onBack: () => void;
}) {
  const scaled = recipe.materials ? scaleMaterials(recipe.materials, headcount) : null;
  // materials 未設定（古いデータ）時は従来の在庫/買い足しチップにフォールバック
  const have = recipe.usedIngredients.filter((i) => i.fromFridge);
  const buy = [...recipe.usedIngredients.filter((i) => !i.fromFridge).map((i) => i.name), ...recipe.missingIngredients].filter(
    (n) => !classify(n).assumed
  );
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.rowBetween}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.link}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>材料</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={[styles.title, { fontSize: 20 }]}>{recipe.title}</Text>

      {showSafetyBanner && (
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyBannerText}>
            設定したアレルギー・配慮の対象食材は含まれません（チェック済み）。市販の調味料は商品により異なるため、召し上がる前に材料を必ずご確認ください。
          </Text>
        </View>
      )}

      {scaled ? (
        <>
          <Text style={styles.servingsNote}>{scaled.servings}人分の分量です</Text>
          {scaled.food.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>食材</Text>
              {scaled.food.map((m) => (
                <View key={m.name} style={styles.matRow}>
                  <Text style={styles.matName}>
                    {m.name}
                    {m.fromFridge ? <Text style={styles.matHave}>（冷蔵庫）</Text> : null}
                  </Text>
                  <Text style={styles.matAmount}>{m.amount}</Text>
                </View>
              ))}
            </>
          )}
          {scaled.seasoning.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>調味料</Text>
              {scaled.seasoning.map((m) => (
                <View key={m.name} style={styles.matRow}>
                  <Text style={styles.matName}>{m.name}</Text>
                  <Text style={styles.matAmount}>{m.amount}</Text>
                </View>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          {have.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>冷蔵庫にあるもの</Text>
              <View style={styles.chips}>
                {have.map((i) => (
                  <View key={i.name} style={styles.chip}>
                    <Text style={styles.chipText}>{i.name}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          {buy.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>買い足すもの</Text>
              <View style={styles.chips}>
                {buy.map((n) => (
                  <View key={n} style={[styles.chip, styles.chipMissing]}>
                    <Text style={styles.chipTextMissing}>{n}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      <Text style={styles.sectionLabel}>かんたん工程</Text>
      {recipe.steps.map((step, idx) => (
        <View key={idx} style={styles.step}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{idx + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      {recipe.childNote ? <Text style={styles.childNote}>※ {recipe.childNote}</Text> : null}

      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20 }]} activeOpacity={0.85} onPress={onChoose}>
        <Text style={styles.primaryBtnText}>これにする</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function DoneScreen({ result, showAd, onReset }: { result: DecideResult; showAd: boolean; onReset: () => void }) {
  const r = result.recipe;
  const have = r.usedIngredients.filter((i) => i.fromFridge);
  const buy = [...r.usedIngredients.filter((i) => !i.fromFridge).map((i) => i.name), ...r.missingIngredients].filter(
    (n) => !classify(n).assumed
  );
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Text style={{ fontSize: 48 }}>🍳</Text>
        <Text style={[styles.muted, { marginTop: 6 }]}>今日はこれ</Text>
        <Text style={[styles.title, { textAlign: 'center', marginTop: 2 }]}>{r.title}</Text>
        <Text style={[styles.muted, { marginTop: 4 }]}>
          {r.cookTimeMinutes}分 ・ {r.washUp.replace('\n', '')} ・ {r.childFriendly ? '取り分け可' : '大人向け'}
        </Text>
      </View>

      {have.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>冷蔵庫にあるもの</Text>
          <View style={styles.chips}>
            {have.map((i) => (
              <View key={i.name} style={styles.chip}>
                <Text style={styles.chipText}>{i.name}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {buy.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>買い足すもの</Text>
          <View style={styles.chips}>
            {buy.map((n) => (
              <View key={n} style={[styles.chip, styles.chipMissing]}>
                <Text style={styles.chipTextMissing}>{n}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>かんたん工程</Text>
      {r.steps.map((step, idx) => (
        <View key={idx} style={styles.step}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{idx + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      {r.childNote ? <Text style={styles.childNote}>※ {r.childNote}</Text> : null}

      {showAd && <View style={{ marginTop: 16 }}><AdSlot /></View>}

      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20 }]} activeOpacity={0.85} onPress={onReset}>
        <Text style={styles.primaryBtnText}>ごちそうさま（おしまい）</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// 静かなネイティブ広告枠（決定後のみ・割り込みなし）。
// 実広告は react-native-google-mobile-ads の NativeAd に差し替え（要・開発ビルド）。
function AdSlot() {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <View style={styles.adSlot}>
      <View style={styles.adHeader}>
        <Text style={styles.adLabel}>広告 ・ PR</Text>
        <TouchableOpacity onPress={() => setClosed(true)}>
          <Text style={styles.adClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.adBody}>
        <View style={styles.adThumb}>
          <Text style={{ fontSize: 20 }}>🏬</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adTitle}>近所のスーパー特売情報</Text>
          <Text style={styles.adDesc}>豚こま 100g 88円〜</Text>
        </View>
        <Text style={styles.adOpen}>開く ›</Text>
      </View>
      <Text style={styles.adSupport}>♡ 広告を見て開発者を応援（任意）</Text>
    </View>
  );
}

// 全画面広告（「ごちそうさま」→ホームの間）。放置で自動的にホームへ戻る。
// 実広告は react-native-google-mobile-ads の Interstitial に差し替え（要・開発ビルド）。
const FULL_AD_SECONDS = 5;
function FullScreenAdModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [left, setLeft] = useState(FULL_AD_SECONDS);
  useEffect(() => {
    if (!visible) return;
    setLeft(FULL_AD_SECONDS);
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(t);
          onClose();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.adFullRoot}>
        <View style={styles.adFullTop}>
          <Text style={styles.adFullLabel}>広告</Text>
          <Text style={styles.adFullTimer}>あと {left} 秒でホームに戻ります</Text>
        </View>
        <View style={styles.adFullBody}>
          <Text style={{ fontSize: 64 }}>🏬</Text>
          <Text style={styles.adFullTitle}>近所のスーパー特売情報</Text>
          <Text style={styles.adFullDesc}>豚こま 100g 88円 ／ 卵 10個 158円 ほか</Text>
        </View>
        <TouchableOpacity style={styles.adFullSkip} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.adFullSkipText}>今すぐホームに戻る ›</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },

  // 冷蔵庫の中を見る（ホームのボタン）
  fridgeViewBtn: { marginTop: 4, height: 52, borderRadius: 14, borderWidth: 1, borderColor: theme.greenFill, backgroundColor: theme.greenTint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fridgeViewEmoji: { fontSize: 20 },
  fridgeViewText: { fontSize: 15, color: theme.greenText, fontWeight: '600' },
  kobachiBtn: { marginTop: 14, marginBottom: 4, height: 56, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  kobachiBtnText: { fontSize: 16, color: theme.textPrimary, fontWeight: '600' },
  kobachiBtnSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  kbOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  kbCard: { width: '100%', maxWidth: 380, backgroundColor: theme.surface, borderRadius: 18, padding: 20 },
  kbLabel: { fontSize: 12, color: theme.textMuted },
  kbTitle: { fontSize: 22, fontWeight: '700', color: theme.textPrimary, marginTop: 4 },
  kbReason: { fontSize: 14, color: theme.textSecondary, marginTop: 6, lineHeight: 20 },
  kbStepRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-start' },
  kbStepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.greenTint, color: theme.greenText, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
  kbStepText: { flex: 1, fontSize: 14, color: theme.textPrimary, lineHeight: 20 },
  kbChildNote: { fontSize: 12, color: theme.textMuted, marginTop: 10, lineHeight: 18 },
  kbBtnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  kbGhostBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, alignItems: 'center', justifyContent: 'center' },
  kbGhostText: { fontSize: 15, color: theme.textPrimary, fontWeight: '600' },
  kbCloseBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: theme.greenFill, alignItems: 'center', justifyContent: 'center' },
  kbCloseText: { fontSize: 15, color: theme.onGreen, fontWeight: '600' },

  // 全画面広告
  adFullRoot: { flex: 1, backgroundColor: theme.surface, paddingHorizontal: 24, paddingVertical: 16, justifyContent: 'space-between' },
  adFullTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adFullLabel: { fontSize: 12, color: theme.textMuted, borderWidth: 1, borderColor: theme.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  adFullTimer: { fontSize: 13, color: theme.textSecondary },
  adFullBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  adFullTitle: { fontSize: 20, fontWeight: '600', color: theme.textPrimary, marginTop: 8 },
  adFullDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
  adFullSkip: { height: 52, borderRadius: 14, backgroundColor: theme.greenFill, alignItems: 'center', justifyContent: 'center' },
  adFullSkipText: { fontSize: 16, color: theme.onGreen, fontWeight: '600' },
  screen: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  flexFill: { flex: 1 },

  h1: { fontSize: 24, fontWeight: '600', color: theme.textPrimary, lineHeight: 34 },
  sub: { fontSize: 13, color: theme.textSecondary, marginTop: 8 },
  hint: { fontSize: 12, color: theme.textMuted, textAlign: 'center', marginBottom: 10 },
  muted: { fontSize: 13, color: theme.textSecondary },
  link: { fontSize: 14, color: theme.greenFill, fontWeight: '500' },

  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'center' },
  fatigueCard: {
    width: '48%',
    aspectRatio: 1.15,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  fatigueCardLimit: { backgroundColor: theme.greenTint, borderColor: theme.greenFill, borderWidth: 2 },
  fatigueEmoji: { fontSize: 40 },
  fatigueLabel: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 10 },
  fatigueSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  greenTextStrong: { color: theme.greenText },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  fatigueBadge: { backgroundColor: theme.greenTint, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  fatigueBadgeText: { fontSize: 13, fontWeight: '600', color: theme.greenText },

  eaterBox: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 14, marginTop: 16 },
  eaterTitle: { fontSize: 15, fontWeight: '500', color: theme.textPrimary },
  exclWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  exclLabel: { fontSize: 12, color: theme.textSecondary },
  exclChip: { backgroundColor: '#FCEBEB', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  exclChipText: { fontSize: 11, color: '#A32D2D' },
  exclNone: { fontSize: 12, color: theme.textMuted, marginTop: 10 },
  eaterChips: { gap: 14, paddingVertical: 12, paddingRight: 8 },
  eaterChip: { alignItems: 'center', gap: 5, width: 56 },
  eaterChipDim: { opacity: 0.4 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border },
  avatarOn: { backgroundColor: theme.greenTint, borderColor: theme.greenFill, borderWidth: 2 },
  avatarInitial: { fontSize: 16, fontWeight: '600', color: theme.textSecondary },
  avatarInitialOn: { color: theme.greenText },
  checkBadge: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.greenFill, alignItems: 'center', justifyContent: 'center' },
  checkBadgeText: { color: theme.onGreen, fontSize: 11, fontWeight: '700' },
  eaterName: { fontSize: 12, color: theme.textPrimary },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 12 },
  collapsedText: { fontSize: 14, color: theme.textPrimary },
  collapsedNote: { fontSize: 11, color: theme.textMuted, marginTop: 8 },

  primaryBtn: { backgroundColor: theme.greenFill, height: 64, borderRadius: theme.radius, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: theme.onGreen, fontSize: 19, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  secondaryBtn: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryBtnText: { fontSize: 14, color: theme.textPrimary },
  cutoff: { textAlign: 'center', fontSize: 13, color: theme.textMuted, marginTop: 16 },

  photo: { height: 88, backgroundColor: theme.greenTint, borderRadius: theme.radius, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { fontSize: 21, fontWeight: '600', color: theme.textPrimary, marginTop: 10 },

  metrics: { flexDirection: 'row', gap: 10, marginTop: 12 },
  metric: { flex: 1, backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  metricValue: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, textAlign: 'center' },
  metricLabel: { fontSize: 11, color: theme.textMuted, marginTop: 4 },

  reasonBox: { backgroundColor: theme.greenTint, borderRadius: 14, padding: 11, marginTop: 10 },
  reasonText: { fontSize: 13, color: theme.greenText, lineHeight: 20 },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginTop: 14, marginBottom: 8 },
  servingsNote: { fontSize: 13, color: theme.textSecondary, marginTop: 10 },
  matRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  matName: { fontSize: 15, color: theme.textPrimary },
  matHave: { fontSize: 12, color: theme.greenText },
  matAmount: { fontSize: 15, color: theme.textSecondary, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: theme.surfaceAlt, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  chipText: { fontSize: 13, color: theme.textPrimary },
  chipMissing: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  chipTextMissing: { fontSize: 13, color: theme.textMuted },
  tagChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  tagChipOn: { backgroundColor: theme.greenFill, borderColor: theme.greenFill },
  tagText: { fontSize: 13, color: theme.textSecondary },
  tagTextOn: { color: theme.onGreen, fontWeight: '500' },

  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.greenTint, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 12, fontWeight: '600', color: theme.greenText },
  stepText: { flex: 1, fontSize: 14, color: theme.textPrimary, lineHeight: 21 },
  childNote: { fontSize: 12, color: theme.textSecondary, marginTop: 12, lineHeight: 18 },
  heroCardAccent: { borderWidth: 2, borderColor: theme.greenFill, borderRadius: 16, padding: 12, marginTop: 14, position: 'relative' },
  recommendBadge: { position: 'absolute', top: -10, left: 16, backgroundColor: theme.greenFill, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  recommendBadgeText: { color: theme.onGreen, fontSize: 11, fontWeight: '600' },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: theme.border, borderRadius: 12, padding: 10, marginBottom: 7 },
  candidateTitle: { fontSize: 15, fontWeight: '500', color: theme.textPrimary },
  candidateMeta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pickBtn: { paddingHorizontal: 14, height: 38, borderRadius: 10, borderWidth: 0.5, borderColor: theme.borderStrong, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  pickBtnText: { fontSize: 13, color: theme.textPrimary },
  safetyBanner: { backgroundColor: theme.warnTint, borderRadius: 12, padding: 12, marginTop: 12 },
  safetyBannerText: { fontSize: 12, color: theme.warnText, lineHeight: 18 },
  adSlot: { backgroundColor: theme.surface, borderWidth: 0.5, borderColor: theme.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  adHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  adLabel: { fontSize: 10, color: theme.textMuted, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  adClose: { fontSize: 13, color: theme.textMuted },
  adBody: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 10 },
  adThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  adTitle: { fontSize: 13, color: theme.textSecondary },
  adDesc: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  adOpen: { fontSize: 12, color: theme.textMuted },
  adSupport: { fontSize: 12, color: theme.greenFill, textAlign: 'center', marginTop: 10 },
});
