/**
 * Workouts: pick a strength or cardio activity, duration and intensity;
 * net calories burned are added to the day's calorie budget in the diary.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays } from '../../../shared/date';
import {
  DURATION_PRESETS,
  INTENSITIES,
  totalBurned,
  totalMinutes,
  workoutKcal,
  WORKOUT_TYPES,
  type Intensity,
  type WorkoutCategory,
  type WorkoutType,
} from '../../../shared/workouts';
import { Button, Card, Chip, Empty, SectionLabel, Title } from '../components/ui';
import { newId, today, useStore } from '../store';
import { colors, radius, space } from '../theme';

const CATEGORIES: { id: WorkoutCategory | 'custom'; label: string }[] = [
  { id: 'strength', label: '🏋️ Силовые' },
  { id: 'cardio', label: '🏃 Кардио' },
  { id: 'custom', label: '⌚ Своя (ккал с часов)' },
];

const CATEGORY_LABEL: Record<WorkoutCategory, string> = { strength: 'Силовая', cardio: 'Кардио' };

export function WorkoutsScreen() {
  const { state, dispatch } = useStore();
  const day = today();
  const weight = state.profile!.weightKg;
  const list = state.workouts[day] ?? [];

  const [category, setCategory] = useState<WorkoutCategory | 'custom'>('strength');
  const [type, setType] = useState<WorkoutType | null>(null);
  const [minutes, setMinutes] = useState('45');
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [customName, setCustomName] = useState('');
  const [customKcal, setCustomKcal] = useState('');

  const mins = Math.round(Number(minutes.replace(',', '.')));
  const validMins = mins > 0 && mins <= 600;
  const preview = type && validMins ? workoutKcal(type.met, intensity, mins, weight) : 0;
  const kcalIn = Math.round(Number(customKcal));

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(day, -i));
    const all = days.flatMap((d) => state.workouts[d] ?? []);
    return { kcal: totalBurned(all), minutes: totalMinutes(all), count: all.length };
  }, [state.workouts, day]);

  const add = () => {
    const createdAt = new Date().toISOString();
    if (category === 'custom') {
      dispatch({
        type: 'addWorkout',
        day,
        workout: {
          id: newId(),
          typeId: 'custom',
          name: customName.trim() || 'Тренировка',
          category: 'cardio',
          minutes: validMins ? mins : 0,
          intensity: 'moderate',
          kcal: kcalIn,
          createdAt,
        },
      });
      setCustomName('');
      setCustomKcal('');
    } else if (type) {
      dispatch({
        type: 'addWorkout',
        day,
        workout: { id: newId(), typeId: type.id, name: type.name, category: type.category, minutes: mins, intensity, kcal: preview, createdAt },
      });
      setType(null);
    }
  };

  const canAdd = category === 'custom' ? kcalIn > 0 && kcalIn <= 5000 : !!type && validMins && preview > 0;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Title>Тренировки</Title>

      <Card style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.muted}>Сожжено сегодня</Text>
          <Text style={styles.big}>{totalBurned(list)} ккал</Text>
          <Text style={styles.muted}>
            {totalMinutes(list)} мин · добавлено к норме в дневнике
          </Text>
        </View>
        <View style={styles.weekBox}>
          <Text style={styles.mutedSmall}>За 7 дней</Text>
          <Text style={styles.weekValue}>{week.kcal} ккал</Text>
          <Text style={styles.mutedSmall}>
            {week.count} трен. · {week.minutes} мин
          </Text>
        </View>
      </Card>

      <Card>
        <SectionLabel>Новая тренировка</SectionLabel>
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              color={colors.fasting}
              active={category === c.id}
              onPress={() => {
                setCategory(c.id);
                setType(null);
              }}
            />
          ))}
        </View>

        {category !== 'custom' ? (
          <>
            <View style={styles.grid}>
              {WORKOUT_TYPES.filter((w) => w.category === category).map((w) => (
                <Pressable
                  key={w.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type?.id === w.id }}
                  onPress={() => setType(w)}
                  style={[styles.typeTile, type?.id === w.id && styles.typeTileActive]}
                >
                  <Text style={styles.typeIcon}>{w.icon}</Text>
                  <Text style={[styles.typeName, type?.id === w.id && { color: '#fff' }]}>{w.name}</Text>
                </Pressable>
              ))}
            </View>

            {type && (
              <View style={styles.form}>
                <Text style={styles.label}>Длительность, мин</Text>
                <View style={styles.wrap}>
                  {DURATION_PRESETS.map((d) => (
                    <Chip key={d} label={String(d)} color={colors.fasting} active={mins === d} onPress={() => setMinutes(String(d))} />
                  ))}
                  <TextInput
                    accessibilityLabel="Длительность в минутах"
                    style={[styles.input, styles.minInput]}
                    keyboardType="number-pad"
                    value={minutes}
                    onChangeText={setMinutes}
                  />
                </View>
                <Text style={styles.label}>Интенсивность</Text>
                <View style={styles.wrap}>
                  {INTENSITIES.map((i) => (
                    <Chip key={i.id} label={i.label} color={colors.fasting} active={intensity === i.id} onPress={() => setIntensity(i.id)} />
                  ))}
                </View>
                <View style={styles.previewBox}>
                  <Text style={styles.previewValue}>≈ {preview} ккал</Text>
                  <Text style={styles.mutedSmall}>
                    {type.name}, {validMins ? mins : '—'} мин, вес {weight} кг
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.form}>
            <Text style={styles.help}>Если часы или фитнес-браслет уже посчитали калории — впишите их сюда.</Text>
            <TextInput
              style={styles.input}
              placeholder="Название (например, «Бокс»)"
              placeholderTextColor={colors.muted}
              value={customName}
              onChangeText={setCustomName}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Сожжено, ккал"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={customKcal}
                onChangeText={setCustomKcal}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Минут"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={minutes}
                onChangeText={setMinutes}
              />
            </View>
          </View>
        )}

        <Button label="Добавить тренировку" color={colors.fasting} disabled={!canAdd} onPress={add} />
      </Card>

      <Card>
        <SectionLabel>Сегодня</SectionLabel>
        {list.length === 0 && <Empty text="Тренировок пока нет — выберите вид выше" />}
        {list.map((w) => (
          <View key={w.id} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>{w.name}</Text>
              <Text style={styles.mutedSmall}>
                {w.typeId === 'custom' ? 'Своя' : CATEGORY_LABEL[w.category]}
                {w.minutes ? ` · ${w.minutes} мин` : ''}
                {w.typeId !== 'custom' ? ` · ${INTENSITIES.find((i) => i.id === w.intensity)?.label.toLowerCase()}` : ''}
              </Text>
            </View>
            <Text style={styles.kcal}>−{w.kcal}</Text>
            <Button
              label="✕"
              variant="ghost"
              color={colors.danger}
              style={{ minHeight: 36, paddingHorizontal: space(2) }}
              onPress={() => dispatch({ type: 'removeWorkout', day, id: w.id })}
            />
          </View>
        ))}
      </Card>

      <Text style={styles.footnote}>
        Расчёт по таблицам MET (Compendium of Physical Activities) с учётом вашего веса. Считаются только калории сверх
        обычного обмена, чтобы не завышать норму. Если вносите тренировки здесь, в «Целях» выберите активность без учёта
        тренировок («Сидячий»).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(4), paddingBottom: space(12) },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  big: { fontSize: 30, fontWeight: '800', color: colors.fasting },
  weekBox: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: space(3), alignItems: 'flex-end' },
  weekValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  help: { color: colors.muted, fontSize: 14, marginBottom: space(3) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  row: { flexDirection: 'row', gap: space(2) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  typeTile: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space(3),
    backgroundColor: colors.card,
  },
  typeTileActive: { backgroundColor: colors.fasting, borderColor: colors.fasting },
  typeIcon: { fontSize: 22, marginBottom: 4 },
  typeName: { fontSize: 14, fontWeight: '600', color: colors.text },
  form: { marginTop: space(3) },
  label: { color: colors.muted, fontSize: 13, marginBottom: space(2), marginTop: space(1) },
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
  minInput: { width: 72, marginBottom: space(2), textAlign: 'center', paddingVertical: space(2) },
  previewBox: { backgroundColor: '#FDEEE7', borderRadius: radius.sm, padding: space(3), marginVertical: space(3) },
  previewValue: { fontSize: 22, fontWeight: '800', color: colors.fasting },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bold: { fontSize: 15, fontWeight: '700', color: colors.text },
  kcal: { fontSize: 16, fontWeight: '800', color: colors.fasting },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: space(2) },
});
