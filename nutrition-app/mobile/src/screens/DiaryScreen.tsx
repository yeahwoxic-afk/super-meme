/** Today's food diary: calorie ring, macros, meals. */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, humanDay } from '../../../shared/date';
import { calcDailyTargets } from '../../../shared/goals';
import { sumMacros } from '../../../shared/nutrition';
import type { FoodEntry, MealType } from '../../../shared/types';
import { stepsKcal, totalBurned, totalMinutes } from '../../../shared/workouts';
import { Button, Card, Empty, ProgressBar, SectionLabel, SegmentRing } from '../components/ui';
import { today, useStore } from '../store';
import { colors, space } from '../theme';

export const MEALS: { id: MealType; label: string; icon: string }[] = [
  { id: 'breakfast', label: 'Завтрак', icon: '🍳' },
  { id: 'lunch', label: 'Обед', icon: '🍲' },
  { id: 'dinner', label: 'Ужин', icon: '🍽️' },
  { id: 'snack', label: 'Перекусы', icon: '🍎' },
];

const SOURCE_ICON: Record<FoodEntry['source'], string> = {
  photo: '📷',
  voice: '🎙️',
  text: '⌨️',
  barcode: '▥',
  manual: '✎',
};

export function DiaryScreen({
  onAdd,
  onWorkouts,
  onSteps,
}: {
  onAdd: () => void;
  onWorkouts: () => void;
  onSteps: () => void;
}) {
  const { state, dispatch } = useStore();
  const [day, setDay] = useState(today());
  const targets = calcDailyTargets(state.profile!);
  const entries = state.entries[day] ?? [];
  const eaten = sumMacros(entries);
  const workouts = state.workouts[day] ?? [];
  const burned = totalBurned(workouts);
  const steps = state.manualSteps[day] ?? 0;
  const walked = stepsKcal(steps, state.profile!.weightKg);
  // Calories burned in workouts and by walking are added to the day's budget.
  const budget = targets.calories + burned + walked;
  const left = budget - eaten.calories;
  const isToday = day === today();

  // Deleted entry kept for a few seconds so an accidental tap can be undone.
  const [undo, setUndo] = useState<{ day: string; entry: FoodEntry; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const remove = (e: FoodEntry) => {
    const index = entries.findIndex((x) => x.id === e.id);
    dispatch({ type: 'removeEntry', day, id: e.id });
    setUndo({ day, entry: e, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const restore = () => {
    if (!undo) return;
    dispatch({ type: 'restoreEntry', day: undo.day, entry: undo.entry, index: undo.index });
    setUndo(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.scroll, undo && { paddingBottom: space(24) }]}>
        <View style={styles.dayRow}>
          <Pressable accessibilityLabel="Предыдущий день" onPress={() => setDay(addDays(day, -1))} hitSlop={12}>
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Text style={styles.day}>{humanDay(day)}</Text>
          <Pressable
            accessibilityLabel="Следующий день"
            disabled={isToday}
            onPress={() => setDay(addDays(day, 1))}
            hitSlop={12}
          >
            <Text style={[styles.arrow, isToday && { opacity: 0.2 }]}>›</Text>
          </Pressable>
        </View>

        <Card style={styles.summary}>
          <SegmentRing
            size={170}
            stroke={16}
            segments={[
              { value: targets.calories, color: colors.normTrack },
              { value: burned, color: colors.fasting },
              { value: walked, color: colors.walk },
            ]}
            progress={eaten.calories / budget}
            progressColor={left < 0 ? colors.danger : colors.primary}
          >
            <Text style={styles.ringValue}>{Math.abs(left)}</Text>
            <Text style={styles.ringLabel}>{left >= 0 ? 'ккал осталось' : 'ккал сверх нормы'}</Text>
          </SegmentRing>
          <View style={styles.sideStats}>
            <Stat label="Норма" value={targets.calories} dot={colors.normTrack} />
            <Stat label="Тренировки" value={burned} prefix="+" color={colors.fasting} dot={colors.fasting} />
            <Stat label="Ходьба" value={walked} prefix="+" color={colors.walk} dot={colors.walk} />
            <Stat label="Съедено" value={eaten.calories} dot={colors.primary} />
          </View>
        </Card>

        <Card>
          <View style={styles.macroRow}>
            <ProgressBar label="Белки" value={eaten.protein} target={targets.protein} unit="г" color={colors.protein} />
            <ProgressBar label="Жиры" value={eaten.fat} target={targets.fat} unit="г" color={colors.fat} />
            <ProgressBar label="Углеводы" value={eaten.carbs} target={targets.carbs} unit="г" color={colors.carbs} />
          </View>
        </Card>

        <Pressable accessibilityRole="button" onPress={onWorkouts}>
          <Card style={styles.workoutCard}>
            <Text style={styles.mealTitle}>🏋️ Тренировки</Text>
            <Text style={[styles.mealKcal, burned > 0 && { color: colors.fasting }]}>
              {burned > 0 ? `+${burned} ккал · ${totalMinutes(workouts)} мин` : isToday ? 'Добавить ›' : '—'}
            </Text>
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={onSteps}>
          <Card style={styles.workoutCard}>
            <Text style={styles.mealTitle}>🚶 Ходьба</Text>
            <Text style={[styles.mealKcal, walked > 0 && { color: colors.walk }]}>
              {walked > 0
                ? `+${walked} ккал · ${steps.toLocaleString('ru-RU')} шагов`
                : isToday
                  ? 'Внести шаги ›'
                  : '—'}
            </Text>
          </Card>
        </Pressable>

        {MEALS.map((m) => {
          const list = entries.filter((e) => e.meal === m.id);
          const total = sumMacros(list);
          return (
            <Card key={m.id}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealTitle}>
                  {m.icon} {m.label}
                </Text>
                <Text style={styles.mealKcal}>{total.calories} ккал</Text>
              </View>
              {list.length === 0 ? (
                <Text style={styles.muted}>Пока пусто</Text>
              ) : (
                list.map((e) => (
                  <View key={e.id} style={styles.entry}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryName}>
                        {SOURCE_ICON[e.source]} {e.name}
                      </Text>
                      <Text style={styles.muted}>
                        {e.grams} г · Б {e.protein} · Ж {e.fat} · У {e.carbs}
                      </Text>
                    </View>
                    <Text style={styles.entryKcal}>{e.calories}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Удалить ${e.name}`}
                      onPress={() => remove(e)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.deleteText}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </Card>
          );
        })}
        {entries.length > 0 && (
          <Text style={[styles.muted, { textAlign: 'center' }]}>✕ — удалить блюдо, если вы его не съели</Text>
        )}
        {entries.length === 0 && isToday && <Empty text="Сфотографируйте еду, надиктуйте или отсканируйте штрихкод" />}

        {isToday && (
          <View style={{ marginTop: space(2) }}>
            <SectionLabel>Добавить еду</SectionLabel>
            <Button label="＋ Сканировать еду с ИИ" onPress={onAdd} />
          </View>
        )}
      </ScrollView>
      {undo && (
        <View style={styles.undoBar} accessibilityLiveRegion="polite">
          <Text style={styles.undoText} numberOfLines={1}>
            −{undo.entry.calories} ккал · удалено «{undo.entry.name}»
          </Text>
          <Pressable accessibilityRole="button" onPress={restore} hitSlop={8}>
            <Text style={styles.undoAction}>Вернуть</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  prefix = '',
  color,
  dot,
}: {
  label: string;
  value: number;
  prefix?: string;
  color?: string;
  dot?: string;
}) {
  return (
    <View style={{ marginBottom: space(2) }}>
      <View style={styles.statLabelRow}>
        {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
        <Text style={styles.muted}>{label}</Text>
      </View>
      <Text style={[styles.statValue, color ? { color } : null]}>
        {prefix}
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(4), paddingBottom: space(12) },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(3) },
  arrow: { fontSize: 34, color: colors.primary, paddingHorizontal: space(3) },
  day: { fontSize: 24, fontWeight: '800', color: colors.text },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  ringValue: { fontSize: 36, fontWeight: '800', color: colors.text },
  ringLabel: { fontSize: 13, color: colors.muted },
  sideStats: { justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  macroRow: { flexDirection: 'row', gap: space(3) },
  deleteBtn: {
    marginLeft: space(3),
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FCE9E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  undoBar: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    bottom: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  undoText: { flex: 1, color: '#fff', fontSize: 14 },
  undoAction: { color: '#7FE0A8', fontSize: 15, fontWeight: '800' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  workoutCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space(2) },
  mealTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  mealKcal: { fontSize: 15, fontWeight: '700', color: colors.muted },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  entryName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  entryKcal: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
});
