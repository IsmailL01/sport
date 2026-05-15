// RegionPickerScreen: manual offline-tile-region picker с draggable-rectangle overlay.
// Phase 1 / PHASE1-10. См. CONTEXT.md D-23..D-26, ТЗ §10.3, DEVELOPMENT_PLAN.md §3 P1-K-04.
// ВАЖНО: never import @rnmapbox/maps directly — go through src/map/ re-exports.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import {
  LocationPuckLayer,
  MapboxView,
  RegionPickerOverlay,
  createCustomPack,
  deleteOfflinePack,
  estimatePackSize,
  listOfflinePacks,
  type Corner,
  type CornerCoord,
  type OfflinePack,
  TILE_CAP_HEADROOM,
} from '../../../map';
import { useActivityStore } from '../../../state/activity';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'RegionPicker'>;

// Стартовый bbox-полуразмер при первом открытии — те же ±0.05° что и home region
// (~5.5 км по широте). Пользователь дальше тянет углы.
const INITIAL_HALF_SIDE_DEG = 0.05;

// Безопасный fallback при отсутствии user-location (Берлин). Лучше показать
// какую-то карту, чем чёрный экран — пользователь перенесёт камеру руками.
const FALLBACK_CENTER: CornerCoord = [13.405, 52.52];

// Жёсткие пределы из ASVS V5 input-validation (CONTEXT.md D-23 + threat T-01-06-01..02).
const MAX_LON_SPAN_DEG = 1.0;

export function RegionPickerScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();

  // Стартовый центр — последняя пользовательская точка (если запись была сегодня),
  // иначе FALLBACK_CENTER. Берём из activityStore без подписки (одноразовое чтение).
  const initialCenter = useMemo<CornerCoord>(() => {
    const pts = useActivityStore.getState().points;
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      return [last.longitude, last.latitude];
    }
    return FALLBACK_CENTER;
  }, []);

  const [ne, setNe] = useState<CornerCoord>([
    initialCenter[0] + INITIAL_HALF_SIDE_DEG,
    initialCenter[1] + INITIAL_HALF_SIDE_DEG,
  ]);
  const [sw, setSw] = useState<CornerCoord>([
    initialCenter[0] - INITIAL_HALF_SIDE_DEG,
    initialCenter[1] - INITIAL_HALF_SIDE_DEG,
  ]);

  const [packName, setPackName] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [existingPacks, setExistingPacks] = useState<OfflinePack[]>([]);

  // Загружаем список существующих паков при mount + после download/delete.
  const refreshPacks = useMemo(
    () =>
      function refresh() {
        listOfflinePacks()
          .then(setExistingPacks)
          .catch((e) => console.warn('[region-picker] listOfflinePacks failed', e));
      },
    [],
  );

  useEffect(() => {
    refreshPacks();
  }, [refreshPacks]);

  // === Drag-handlers ===

  const handleCornerDrag = (which: Corner, coord: CornerCoord) => {
    // Обновляем нужную пару (ne/sw) — углы nw/se производные.
    if (which === 'ne') {
      setNe(coord);
    } else if (which === 'sw') {
      setSw(coord);
    } else if (which === 'nw') {
      // NW = [sw.lng, ne.lat] → drag меняет sw.lng + ne.lat
      setSw([coord[0], sw[1]]);
      setNe([ne[0], coord[1]]);
    } else if (which === 'se') {
      // SE = [ne.lng, sw.lat] → drag меняет ne.lng + sw.lat
      setNe([coord[0], ne[1]]);
      setSw([sw[0], coord[1]]);
    }
  };

  // === Estimator ===

  const estimate = useMemo(() => estimatePackSize({ ne, sw }), [ne, sw]);
  const sizeMb = estimate.kb / 1024;
  const tooBig = estimate.tiles > TILE_CAP_HEADROOM;
  const inverted = ne[1] <= sw[1] || ne[0] <= sw[0];
  const tooWide = Math.abs(ne[0] - sw[0]) > MAX_LON_SPAN_DEG;
  const invalid = inverted || tooWide;

  // === Download ===

  const handleDownload = () => {
    if (invalid) {
      Alert.alert(
        'Неверные границы',
        inverted
          ? 'Углы перепутаны: NE должен быть выше и правее SW.'
          : `Слишком широкая область (>${MAX_LON_SPAN_DEG}° по долготе).`,
      );
      return;
    }
    if (tooBig) {
      Alert.alert(
        'Слишком большая область',
        `~${estimate.tiles} тайлов превышают лимит ${TILE_CAP_HEADROOM} (iOS Mapbox ограничивает паки 6000 тайлами).`,
      );
      return;
    }

    Alert.alert(
      'Скачать регион?',
      `~${sizeMb.toFixed(1)} MB, ${estimate.tiles} тайлов (zoom 12–16).`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Скачать',
          onPress: () => {
            const finalName = packName.trim() || `region-${Date.now()}`;
            setDownloading(true);
            setProgress(0);
            createCustomPack({
              name: finalName,
              ne,
              sw,
              onProgress: setProgress,
            })
              .then(() => {
                setDownloading(false);
                Alert.alert('Готово', `Регион «${finalName}» скачан.`);
                refreshPacks();
              })
              .catch((e) => {
                console.error('[region-picker] download failed', e);
                setDownloading(false);
                Alert.alert(
                  'Ошибка',
                  `Не удалось скачать: ${(e as Error)?.message ?? String(e)}`,
                );
              });
          },
        },
      ],
    );
  };

  // === Delete ===

  const handleDeletePack = (name: string) => {
    Alert.alert('Удалить регион?', `«${name}»`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteOfflinePack(name)
            .then(refreshPacks)
            .catch((e) => {
              console.error('[region-picker] delete failed', e);
              Alert.alert('Ошибка', 'Не удалось удалить регион.');
            });
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      {/* Map host */}
      <View style={styles.mapHost}>
        <MapboxView
          followUserLocation={false}
          centerCoordinate={initialCenter}
          zoomLevel={13}
        >
          <LocationPuckLayer />
          <RegionPickerOverlay
            ne={ne}
            sw={sw}
            onCornerDrag={handleCornerDrag}
            fillColor={t.lime ?? '#10B981'}
          />
        </MapboxView>

        {/* Header overlay */}
        <View style={styles.headerOverlay} pointerEvents="box-none">
          <View style={styles.headerInner}>
            <Pressable onPress={() => nav.goBack()} hitSlop={10}>
              <View
                style={[
                  styles.headerBtn,
                  { backgroundColor: t.surface ?? '#1A1A1A' },
                ]}
              >
                <Icon name="back" size={22} color={t.text} />
              </View>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text
                numberOfLines={1}
                style={{
                  color: t.text,
                  fontSize: 17 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                }}
              >
                Выбор области
              </Text>
            </View>
            {/* Spacer to balance the back button. */}
            <View style={styles.headerBtn} />
          </View>
        </View>
      </View>

      {/* Bottom panel: estimator + name + download + list */}
      <ScrollView
        style={[styles.panel, { backgroundColor: t.bg }]}
        contentContainerStyle={{ paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.row}>
          <Text style={[styles.dim, { color: t.text2, fontFamily: t.font }]}>
            Тайлов
          </Text>
          <Text
            style={[
              styles.metric,
              {
                color: tooBig ? t.error : t.text,
                fontFamily: t.fontDisplay ?? t.font,
              },
            ]}
          >
            {estimate.tiles}
            <Text style={[styles.dim, { color: t.text3, fontFamily: t.font }]}>
              {' / '}
              {TILE_CAP_HEADROOM}
            </Text>
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.dim, { color: t.text2, fontFamily: t.font }]}>
            Размер
          </Text>
          <Text
            style={[
              styles.metric,
              {
                color: tooBig ? t.error : t.text,
                fontFamily: t.fontDisplay ?? t.font,
              },
            ]}
          >
            {sizeMb.toFixed(1)} MB
          </Text>
        </View>

        {invalid && (
          <Text
            style={{
              color: t.error,
              fontSize: 12 * t.fontScale,
              fontFamily: t.font,
              marginTop: 4,
            }}
          >
            {inverted
              ? 'Перепутаны углы (NE должен быть выше-правее SW).'
              : `Слишком широко (>${MAX_LON_SPAN_DEG}° по долготе).`}
          </Text>
        )}

        <Text
          style={{
            color: t.text2,
            fontSize: 13 * t.fontScale,
            fontFamily: t.font,
            marginTop: 16,
            marginBottom: 6,
          }}
        >
          Название пака
        </Text>
        <TextInput
          value={packName}
          onChangeText={setPackName}
          placeholder={`region-${Date.now().toString().slice(-6)}`}
          placeholderTextColor={t.text3}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            backgroundColor: t.surface2,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: t.text,
            fontSize: 14 * t.fontScale,
            fontFamily: t.font,
          }}
        />

        <Pressable
          onPress={handleDownload}
          disabled={downloading || invalid || tooBig}
          style={({ pressed }) => [
            styles.downloadBtn,
            {
              backgroundColor:
                downloading || invalid || tooBig
                  ? t.surface2
                  : t.lime ?? '#10B981',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: downloading || invalid || tooBig ? t.text3 : '#000',
              fontSize: 15 * t.fontScale,
              fontWeight: '700',
              fontFamily: t.font,
            }}
          >
            {downloading
              ? `Скачивание… ${Math.round(progress)}%`
              : 'Скачать'}
          </Text>
        </Pressable>

        {/* Existing packs list */}
        <Text
          style={{
            color: t.text3,
            fontSize: 11 * t.fontScale,
            letterSpacing: 0.5,
            fontFamily: t.font,
            marginTop: 24,
            marginBottom: 8,
          }}
        >
          СКАЧАННЫЕ РЕГИОНЫ
        </Text>
        {existingPacks.length === 0 ? (
          <Text
            style={{
              color: t.text3,
              fontSize: 13 * t.fontScale,
              fontFamily: t.font,
              paddingVertical: 8,
            }}
          >
            Пока ничего не скачано.
          </Text>
        ) : (
          existingPacks.map((p) => (
            <View
              key={p.name}
              style={[styles.packRow, { borderColor: t.border ?? '#222' }]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: t.text,
                    fontSize: 14 * t.fontScale,
                    fontFamily: t.font,
                    fontWeight: '600',
                  }}
                >
                  {p.name}
                </Text>
                <Text
                  style={{
                    color: t.text3,
                    fontSize: 11 * t.fontScale,
                    fontFamily: t.font,
                  }}
                >
                  {p.state}
                </Text>
              </View>
              <Pressable
                onPress={() => handleDeletePack(p.name)}
                hitSlop={8}
              >
                {({ pressed }) => (
                  <Text
                    style={{
                      color: t.error,
                      fontSize: 13 * t.fontScale,
                      fontFamily: t.font,
                      fontWeight: '600',
                      opacity: pressed ? 0.6 : 1,
                    }}
                  >
                    Удалить
                  </Text>
                )}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapHost: { flex: 1, minHeight: 300 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  panel: {
    flex: 0,
    maxHeight: '45%',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  metric: { fontSize: 18, fontWeight: '700' },
  dim: { fontSize: 13 },
  downloadBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
