/** Profile & goals. Also used as the onboarding screen on first launch. */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { calcDailyTargets, weeksToTarget } from '../../../shared/goals';
import type { ActivityLevel, GoalType, Sex, UserProfile } from '../../../shared/types';
import { Button, Card, Chip, Field, SectionLabel, Title } from '../components/ui';
import { useStore } from '../store';
import { colors, space } from '../theme';

const GOALS: { id: GoalType; label: string; hint: string }[] = [
  { id: 'lose', label: 'Снизить вес', hint: 'Дефицит ~20 %, больше белка' },
  { id: 'gain', label: 'Набрать массу', hint: 'Профицит ~12 %, белок 1,8 г/кг' },
  { id: 'maintain', label: 'Поддерживать форму', hint: 'Калории = расход' },
  { id: 'healthy', label: 'Здоровое питание', hint: 'Баланс БЖУ и клетчатка' },
];

const ACTIVITY: { id: ActivityLevel; label: string }[] = [
  { id: 'sedentary', label: 'Сидячий' },
  { id: 'light', label: '1–3 трен./нед' },
  { id: 'moderate', label: '3–5 трен./нед' },
  { id: 'active', label: '6–7 трен./нед' },
  { id: 'very_active', label: 'Физ. работа' },
];

const num = (s: string) => Number(s.replace(',', '.'));

export function ProfileScreen({ onSaved, onboarding }: { onSaved?: () => void; onboarding?: boolean }) {
  const { state, dispatch } = useStore();
  const p = state.profile;
  const [sex, setSex] = useState<Sex>(p?.sex ?? 'female');
  const [age, setAge] = useState(p ? String(p.age) : '');
  const [height, setHeight] = useState(p ? String(p.heightCm) : '');
  const [weight, setWeight] = useState(p ? String(p.weightKg) : '');
  const [target, setTarget] = useState(p?.targetWeightKg ? String(p.targetWeightKg) : '');
  const [activity, setActivity] = useState<ActivityLevel>(p?.activity ?? 'light');
  const [goal, setGoal] = useState<GoalType>(p?.goal ?? 'lose');
  const [onGlp1, setOnGlp1] = useState(p?.onGlp1 ?? false);

  const draft: UserProfile | null = useMemo(() => {
    const a = num(age), h = num(height), w = num(weight), t = num(target);
    if (!(a >= 14 && a <= 100 && h >= 120 && h <= 230 && w >= 30 && w <= 300)) return null;
    return { sex, age: a, heightCm: h, weightKg: w, targetWeightKg: t >= 30 && t <= 300 ? t : undefined, activity, goal, onGlp1 };
  }, [sex, age, height, weight, target, activity, goal, onGlp1]);

  const targets = draft ? calcDailyTargets(draft) : null;
  const weeks = draft && targets ? weeksToTarget(draft, targets) : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Title>{onboarding ? 'Добро пожаловать 👋' : 'Профиль и цели'}</Title>
      {onboarding && (
        <Text style={styles.lead}>Расскажите о себе — рассчитаем вашу норму калорий, белка и воды.</Text>
      )}

      <Card>
        <SectionLabel>Цель</SectionLabel>
        {GOALS.map((g) => (
          <Chip key={g.id} label={`${g.label} · ${g.hint}`} active={goal === g.id} onPress={() => setGoal(g.id)} />
        ))}
      </Card>

      <Card>
        <SectionLabel>О вас</SectionLabel>
        <View style={styles.row}>
          <Chip label="Женщина" active={sex === 'female'} onPress={() => setSex('female')} />
          <Chip label="Мужчина" active={sex === 'male'} onPress={() => setSex('male')} />
        </View>
        <View style={styles.row}>
          <Field label="Возраст" keyboardType="number-pad" value={age} onChangeText={setAge} placeholder="30" />
          <Field label="Рост, см" keyboardType="decimal-pad" value={height} onChangeText={setHeight} placeholder="170" />
        </View>
        <View style={styles.row}>
          <Field label="Вес, кг" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder="70" />
          <Field label="Желаемый вес" keyboardType="decimal-pad" value={target} onChangeText={setTarget} placeholder="—" />
        </View>
        <SectionLabel>Активность</SectionLabel>
        <View style={styles.wrap}>
          {ACTIVITY.map((a) => (
            <Chip key={a.id} label={a.label} active={activity === a.id} onPress={() => setActivity(a.id)} />
          ))}
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Принимаю GLP-1</Text>
            <Text style={styles.muted}>Оземпик, Мунджаро и др. — увеличим белок, ограничим дефицит</Text>
          </View>
          <Switch value={onGlp1} onValueChange={setOnGlp1} trackColor={{ true: colors.glp1 }} />
        </View>
      </Card>

      {targets && (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
          <SectionLabel>Ваша дневная норма</SectionLabel>
          <Text style={styles.bigNumber}>{targets.calories} ккал</Text>
          <Text style={styles.macros}>
            Белки {targets.protein} г · Жиры {targets.fat} г · Углеводы {targets.carbs} г
          </Text>
          <Text style={styles.muted}>
            Вода {(targets.waterMl / 1000).toFixed(2)} л · {targets.steps.toLocaleString('ru-RU')} шагов · клетчатка {targets.fiber} г
          </Text>
          <Text style={[styles.muted, { marginTop: 6 }]}>
            Базовый обмен {targets.bmr} ккал, расход {targets.tdee} ккал
            {weeks ? ` · до цели ≈ ${weeks} нед.` : ''}
          </Text>
        </Card>
      )}

      <Button
        label={onboarding ? 'Начать' : 'Сохранить'}
        disabled={!draft}
        onPress={() => {
          if (!draft) return;
          dispatch({ type: 'setProfile', profile: draft });
          onSaved?.();
        }}
      />
      <Text style={[styles.muted, { marginTop: space(3), textAlign: 'center' }]}>
        Расчёт по формуле Миффлина–Сан Жеора. Не заменяет консультацию врача.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(4), paddingBottom: space(12) },
  lead: { fontSize: 16, color: colors.muted, marginBottom: space(4) },
  row: { flexDirection: 'row', gap: space(3), marginBottom: space(3), flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(2) },
  switchTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  bigNumber: { fontSize: 34, fontWeight: '800', color: colors.primary },
  macros: { fontSize: 15, color: colors.text, fontWeight: '600', marginVertical: 4 },
});
