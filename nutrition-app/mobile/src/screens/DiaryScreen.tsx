/** Today's food diary: calorie ring, macros, meals. */
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, humanDay } from '../../../shared/date';
import { calcDailyTargets } from '../../../shared/goals';
import { sumMacros } from '../../../shared/nutrition';
import type { FoodEntry, MealType } from '../../../shared/types';
import { totalBurned, totalMinutes } from '../../../shared/workouts';
import { Button, Card, Empty, ProgressBar, Ring, SectionLabel } from '../components/ui';
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

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message)) onYes();
    return;
  }
  Alert.alert(message, undefined, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: onYes },
  ]);
}

export function DiaryScreen({ onAdd, onWorkouts }: { onAdd: () => void; onWorkouts: () => void }) {
  const { state, dispatch } = useStore();
  const [day, setDay] = useState(today());
  const targets = calcDailyTargets(state.profile!);
  const entries = state.entries[day] ?? [];
  const eaten = sumMacros(entries);
  const workouts = state.workouts[day] ?? [];
  const burned = totalBurned(workouts);
  // Calories burned in workouts are added to the day's budget.
  const budget = targets.calories + burned;
  const left = budget - eaten.calories;
  const isToday = day === today();

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
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
        <Ring size={170} stroke={14} progress={eaten.calories / budget} color={left < 0 ? colors.danger : colors.primary}>
          <Text style={styles.ringValue}>{Math.abs(left)}</Text>
          <Text style={styles.ringLabel}>{left >= 0 ? 'ккал осталось' : 'ккал сверх нормы'}</Text>
        </Ring>
        <View style={styles.sideStats}>
          <Stat label="Норма" value={targets.calories} />
          {burned > 0 && <Stat label="Тренировки" value={burned} prefix="+" color={colors.fasting} />}
          <Stat label="Съедено" value={eaten.calories} />
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
                <Pressable
                  key={e.id}
                  onLongPress={() => confirm(`Удалить «${e.name}»?`, () => dispatch({ type: 'removeEntry', day, id: e.id }))}
                  style={styles.entry}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryName}>
                      {SOURCE_ICON[e.source]} {e.name}
                    </Text>
                    <Text style={styles.muted}>
                      {e.grams} г · Б {e.protein} · Ж {e.fat} · У {e.carbs}
                    </Text>
                  </View>
                  <Text style={styles.entryKcal}>{e.calories}</Text>
                </Pressable>
              ))
            )}
          </Card>
        );
      })}
      {entries.length > 0 && <Text style={[styles.muted, { textAlign: 'center' }]}>Долгое нажатие — удалить запись</Text>}
      {entries.length === 0 && isToday && <Empty text="Сфотографируйте еду, надиктуйте или отсканируйте штрихкод" />}

      {isToday && (
        <View style={{ marginTop: space(2) }}>
          <SectionLabel>Добавить еду</SectionLabel>
          <Button label="＋ Сканировать еду с ИИ" onPress={onAdd} />
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, prefix = '', color }: { label: string; value: number; prefix?: string; color?: string }) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Text style={styles.muted}>{label}</Text>
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
