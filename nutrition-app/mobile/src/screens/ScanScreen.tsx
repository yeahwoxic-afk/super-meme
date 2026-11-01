/**
 * AI food scanner: photo, voice, barcode or text → review → save to diary.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { sumMacros, withGrams } from '../../../shared/nutrition';
import type { FoodItem, FoodSource, MealType, RecognitionResult } from '../../../shared/types';
import { api } from '../api';
import { Button, Card, Chip, Empty, SectionLabel, Title } from '../components/ui';
import { startDictation, speechAvailable } from '../speech';
import { newId, today, useStore } from '../store';
import { colors, radius, space } from '../theme';
import { MEALS } from './DiaryScreen';

type Mode = 'photo' | 'voice' | 'barcode' | 'text';

const MODES: { id: Mode; label: string }[] = [
  { id: 'photo', label: '📷 Фото' },
  { id: 'voice', label: '🎙️ Голос' },
  { id: 'barcode', label: '▥ Штрихкод' },
  { id: 'text', label: '⌨️ Текст' },
];

function mealForNow(d = new Date()): MealType {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

interface Draft {
  result: RecognitionResult;
  source: FoodSource;
  preview?: string;
}

export function ScanScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('photo');
  const [draft, setDraft] = useState<Draft | null>(null);

  if (draft) {
    return <Review draft={draft} onCancel={() => setDraft(null)} onSaved={onDone} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Title>ИИ-сканер еды</Title>
        <View style={styles.modes}>
          {MODES.map((m) => (
            <Chip key={m.id} label={m.label} active={mode === m.id} onPress={() => setMode(m.id)} />
          ))}
        </View>
        {mode === 'photo' && <PhotoMode onResult={setDraft} />}
        {mode === 'voice' && <VoiceMode onResult={setDraft} />}
        {mode === 'barcode' && <BarcodeMode onResult={setDraft} />}
        {mode === 'text' && <TextMode onResult={setDraft} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type OnResult = (d: Draft) => void;

function ErrorText({ text }: { text: string | null }) {
  return text ? <Text style={styles.error}>{text}</Text> : null;
}

/* ---------- Photo ---------- */

function PhotoMode({ onResult }: { onResult: OnResult }) {
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>();

  async function pick(fromCamera: boolean) {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    let res: ImagePicker.ImagePickerResult;
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setError('Разрешите доступ к камере в настройках');
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
    } catch {
      return setError('Камера недоступна на этом устройстве — выберите фото из галереи');
    }
    if (res.canceled || !res.assets[0]) return;

    setBusy(true);
    try {
      // Downscale before upload: faster, cheaper, and plenty for recognition.
      const ref = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1024 }).renderAsync();
      const img = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
      setPreview(img.uri);
      const result = await api.recognizePhoto(img.base64!, hint);
      if (result.items.length === 0) setError(result.note ?? 'Еда на фото не найдена');
      else onResult({ result, source: 'photo', preview: img.uri });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.help}>
        Сфотографируйте тарелку целиком — ИИ определит блюда, оценит вес порции и посчитает КБЖУ. Можно снять и этикетку.
      </Text>
      {preview && <Image source={{ uri: preview }} style={styles.preview} />}
      <TextInput
        style={styles.input}
        placeholder="Уточнение (необязательно): «без масла», «порция 300 г»"
        placeholderTextColor={colors.muted}
        value={hint}
        onChangeText={setHint}
      />
      <Button label={busy ? 'Анализирую…' : 'Сделать фото'} loading={busy} onPress={() => pick(true)} />
      <View style={{ height: space(2) }} />
      <Button label="Выбрать из галереи" variant="secondary" disabled={busy} onPress={() => pick(false)} />
      <ErrorText text={error} />
    </Card>
  );
}

/* ---------- Voice ---------- */

function VoiceMode({ onResult }: { onResult: OnResult }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const available = speechAvailable();

  useEffect(() => () => stopRef.current?.(), []);

  async function toggle() {
    setError(null);
    if (listening) {
      stopRef.current?.();
      return;
    }
    try {
      stopRef.current = await startDictation({
        onText: (t) => setText(t),
        onEnd: () => setListening(false),
        onError: (m) => {
          setListening(false);
          setError(m);
        },
      });
      setListening(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.recognizeText(text);
      if (result.items.length === 0) setError(result.note ?? 'Не удалось понять, что вы съели');
      else onResult({ result, source: 'voice' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.help}>
        Скажите, что съели, например: «Овсянка на молоке, банан и капучино без сахара».
      </Text>
      {available ? (
        <Button
          label={listening ? '■ Остановить' : '🎙️ Начать диктовку'}
          color={listening ? colors.danger : colors.primary}
          onPress={toggle}
        />
      ) : (
        <Text style={styles.muted}>Используйте кнопку микрофона на клавиатуре для диктовки.</Text>
      )}
      <TextInput
        style={[styles.input, styles.multiline, { marginTop: space(3) }]}
        multiline
        placeholder="Здесь появится расшифровка…"
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={setText}
      />
      <Button label="Посчитать КБЖУ" loading={busy} disabled={text.trim().length < 2 || listening} onPress={submit} />
      <ErrorText text={error} />
    </Card>
  );
}

/* ---------- Barcode ---------- */

function BarcodeMode({ onResult }: { onResult: OnResult }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function lookup(value: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const p = await api.barcode(value.trim());
      const item = { ...p.item, name: p.brand ? `${p.name} (${p.brand})` : p.name };
      onResult({ result: { items: [item], totals: sumMacros([item]) }, source: 'barcode' });
    } catch (e) {
      setError(`${(e as Error).message}. Попробуйте сфотографировать этикетку в режиме «Фото».`);
    } finally {
      setBusy(false);
      setTimeout(() => (lock.current = false), 1500);
    }
  }

  const onScanned = (r: BarcodeScanningResult) => {
    setCode(r.data);
    lookup(r.data);
  };

  return (
    <Card>
      <Text style={styles.help}>Наведите камеру на штрихкод упаковки. Данные берутся из базы Open Food Facts.</Text>
      {Platform.OS !== 'web' &&
        (permission?.granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={busy ? undefined : onScanned}
            />
            <View style={styles.scanFrame} pointerEvents="none" />
          </View>
        ) : (
          <Button label="Разрешить камеру" variant="secondary" onPress={requestPermission} />
        ))}
      <View style={[styles.row, { marginTop: space(3) }]}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="или введите код вручную"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        <Button label="Найти" loading={busy} disabled={!/^\d{8,14}$/.test(code)} onPress={() => lookup(code)} />
      </View>
      <ErrorText text={error} />
    </Card>
  );
}

/* ---------- Text ---------- */

function TextMode({ onResult }: { onResult: OnResult }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.recognizeText(text);
      if (result.items.length === 0) setError(result.note ?? 'Не удалось понять описание');
      else onResult({ result, source: 'text' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.help}>Опишите приём пищи своими словами — ИИ разложит его на продукты.</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        multiline
        placeholder="2 яйца, тост с авокадо, кофе с молоком"
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={setText}
      />
      <Button label="Посчитать КБЖУ" loading={busy} disabled={text.trim().length < 2} onPress={submit} />
      <ErrorText text={error} />
    </Card>
  );
}

/* ---------- Review ---------- */

function Review({ draft, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: () => void }) {
  const { dispatch } = useStore();
  const [items, setItems] = useState<FoodItem[]>(draft.result.items);
  const [meal, setMeal] = useState<MealType>(mealForNow());
  const totals = sumMacros(items);

  const setGrams = (i: number, s: string) => {
    const g = Number(s.replace(',', '.'));
    if (!Number.isFinite(g)) return;
    setItems((prev) => prev.map((it, j) => (j === i ? withGrams(it, g) : it)));
  };

  const save = () => {
    const now = new Date().toISOString();
    dispatch({
      type: 'addEntries',
      day: today(),
      entries: items
        .filter((i) => i.grams > 0)
        .map((i) => ({ ...i, id: newId(), meal, source: draft.source, createdAt: now })),
    });
    onSaved();
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Title>Проверьте результат</Title>
      {draft.preview && <Image source={{ uri: draft.preview }} style={styles.preview} />}
      {draft.result.note ? <Text style={[styles.help, { marginBottom: space(3) }]}>💡 {draft.result.note}</Text> : null}

      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={styles.total}>{totals.calories} ккал</Text>
        <Text style={styles.totalMacros}>
          Б {totals.protein} г · Ж {totals.fat} г · У {totals.carbs} г
        </Text>
      </Card>

      {items.length === 0 && <Empty text="Все позиции удалены" />}
      {items.map((it, i) => (
        <Card key={`${it.name}-${i}`}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{it.name}</Text>
              <Text style={styles.muted}>
                {it.calories} ккал · Б {it.protein} · Ж {it.fat} · У {it.carbs}
              </Text>
              {it.confidence < 0.6 && <Text style={styles.warn}>Проверьте вес — ИИ не уверен</Text>}
            </View>
            <View style={styles.gramsBox}>
              <TextInput
                accessibilityLabel={`Вес: ${it.name}`}
                style={styles.gramsInput}
                keyboardType="decimal-pad"
                defaultValue={String(it.grams)}
                onChangeText={(s) => setGrams(i, s)}
              />
              <Text style={styles.muted}>г</Text>
            </View>
          </View>
          <Button
            label="Удалить"
            variant="ghost"
            color={colors.danger}
            style={{ minHeight: 32, alignSelf: 'flex-start', paddingHorizontal: 0 }}
            onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}
          />
        </Card>
      ))}

      <SectionLabel>Приём пищи</SectionLabel>
      <View style={styles.modes}>
        {MEALS.map((m) => (
          <Chip key={m.id} label={`${m.icon} ${m.label}`} active={meal === m.id} onPress={() => setMeal(m.id)} />
        ))}
      </View>

      <Button label="Добавить в дневник" disabled={items.length === 0} onPress={save} />
      <View style={{ height: space(2) }} />
      <Button label="Назад" variant="secondary" onPress={onCancel} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(4), paddingBottom: space(12) },
  modes: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space(2) },
  help: { color: colors.muted, fontSize: 14, marginBottom: space(3), lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13 },
  input: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space(3),
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBF9',
    marginBottom: space(3),
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { color: colors.danger, marginTop: space(3), fontSize: 14 },
  warn: { color: colors.warn, fontSize: 13, marginTop: 2, fontWeight: '600' },
  preview: { width: '100%', height: 200, borderRadius: radius.md, marginBottom: space(3) },
  cameraBox: { height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  scanFrame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '35%',
    bottom: '35%',
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: radius.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  total: { fontSize: 32, fontWeight: '800', color: colors.primary },
  totalMacros: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemName: { fontSize: 16, fontWeight: '700', color: colors.text },
  gramsBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gramsInput: {
    width: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: space(2),
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
