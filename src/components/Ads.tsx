import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import { loadAdsModule, nativeAdUnitId, interstitialAdUnitId, bannerAdUnitId } from '../engine/adsSdk';
import type { NativeAd as NativeAdType } from 'react-native-google-mobile-ads';

// 細めのバナー。意思決定フロー（疲労度→決めて→提案→これにする）には出さない方針のため、
// 置いてよいのは履歴・設定のような「決める行為と関係ない画面」だけ（src/engine/ads.ts のコメント参照）。
// ロードに失敗したら何も描画しない（空の枠だけ残さない）。
export function LiveBannerAd() {
  const [failed, setFailed] = useState(false);
  const mod = loadAdsModule();
  if (!mod || failed) return null;
  const { BannerAd, BannerAdSize } = mod;
  const unitId = bannerAdUnitId(mod);
  return (
    <View style={s.bannerWrap}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} // 画面幅に合わせつつ高さは控えめ
        onAdLoaded={() => console.log(`[ads] バナー表示OK (${unitId})`)}
        onAdFailedToLoad={(e) => {
          console.log(`[ads] バナー読み込み失敗 (${unitId}): ${String(e)}`);
          setFailed(true);
        }}
      />
    </View>
  );
}

// 実広告（AdMob NativeAd）。取得できない/失敗した場合は何も描画しない
// （プレースホルダー風の偽コンテンツを本番ユーザーに見せないため。placeholderモードは
// App.tsx側の旧モックAdSlotがそのまま担当する）。
export function LiveNativeAdSlot() {
  const [ad, setAd] = useState<NativeAdType | null>(null);
  const [failed, setFailed] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const mod = loadAdsModule();
    if (!mod) { setFailed(true); return; }
    mod.NativeAd.createForAdRequest(nativeAdUnitId(mod))
      .then((loaded) => { if (!cancelled) setAd(loaded); else loaded.destroy(); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => () => { ad?.destroy(); }, [ad]);

  const mod = loadAdsModule();
  if (failed || closed || !ad || !mod) return null;
  const { NativeAdView, NativeAsset, NativeAssetType } = mod;

  return (
    <NativeAdView nativeAd={ad} style={s.adSlot}>
      <View style={s.adHeader}>
        <Text style={s.adLabel}>広告・PR</Text>
        <TouchableOpacity onPress={() => setClosed(true)} hitSlop={8}>
          <Text style={s.adClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={s.adBody}>
        {ad.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={s.adThumb} />
          </NativeAsset>
        ) : (
          <View style={s.adThumb} />
        )}
        <View style={{ flex: 1 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={s.adTitle} numberOfLines={1}>{ad.headline}</Text>
          </NativeAsset>
          {ad.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={s.adDesc} numberOfLines={1}>{ad.body}</Text>
            </NativeAsset>
          ) : null}
        </View>
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={s.adOpen}>{ad.callToAction || '開く'} ›</Text>
        </NativeAsset>
      </View>
    </NativeAdView>
  );
}

// 実広告（AdMob InterstitialAd）。「ごちそうさま」→ホームの間に表示する全画面広告。
// ロードが間に合わない/失敗した場合は広告なしでそのまま閉じる（ユーザーを待たせない）。
export function LiveInterstitialAd({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const shownRef = useRef(false);

  // このコンポーネントは常時マウントされている（App.tsx側で <FullScreenAdModal visible=... /> を
  // 常に描画しているため）。そのため visible になるまでは広告SDKに一切触れない：
  //  - マウント時にロードすると、表示しないのに起動毎に広告リクエストが飛ぶ（表示率が落ちる）
  //  - モジュール未リンク時に onClose() が起動直後に発火し、アプリ状態が reset されてしまう
  useEffect(() => {
    if (!visible || shownRef.current) return;
    const mod = loadAdsModule();
    if (!mod) { onClose(); return; } // 未リンク/liveでない → 広告なしでそのまま閉じる

    let cancelled = false;
    const unitId = interstitialAdUnitId(mod);
    console.log(`[ads] 全画面広告のロード開始 (${unitId})`);
    const interstitial = mod.InterstitialAd.createForAdRequest(unitId);
    const unsubLoaded = interstitial.addAdEventListener(mod.AdEventType.LOADED, () => {
      if (cancelled || shownRef.current) return;
      shownRef.current = true;
      console.log('[ads] 全画面広告を表示');
      interstitial.show();
    });
    const unsubError = interstitial.addAdEventListener(mod.AdEventType.ERROR, (e) => {
      console.log(`[ads] 全画面広告の読み込み失敗: ${String(e)}`);
      if (!cancelled) onClose();
    });
    const unsubClosed = interstitial.addAdEventListener(mod.AdEventType.CLOSED, () => { if (!cancelled) onClose(); });
    interstitial.load();
    // ロードが間に合わなければ広告を諦めて閉じる（ユーザーを待たせない上限）
    const t = setTimeout(() => {
      if (!cancelled && !shownRef.current) { console.log('[ads] 全画面広告が3秒で間に合わず断念'); onClose(); }
    }, 3000);

    return () => { cancelled = true; clearTimeout(t); unsubLoaded(); unsubError(); unsubClosed(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return null; // 表示自体はSDK側のネイティブ全画面ビューが担当する
}

const s = StyleSheet.create({
  bannerWrap: { alignItems: 'center', marginTop: 8 },
  adSlot: { backgroundColor: theme.surface, borderWidth: 0.5, borderColor: theme.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  adHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  adLabel: { fontSize: 10, color: theme.textMuted, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  adClose: { fontSize: 13, color: theme.textMuted },
  adBody: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 10 },
  adThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 0.5, borderColor: theme.border },
  adTitle: { fontSize: 13, color: theme.textSecondary },
  adDesc: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  adOpen: { fontSize: 12, color: theme.textMuted },
});
