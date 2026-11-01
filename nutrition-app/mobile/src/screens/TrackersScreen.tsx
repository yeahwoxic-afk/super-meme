/** Habit trackers: water, steps, weight, intermittent fasting, GLP-1 doses. */
import { Pedometer } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NUTRITION_CONFIG } from '../../../shared/config';
import { humanDay, startOfDay } from '../../../shared/date';
import { FASTING_PROTOCOLS, fastingStage, fastingStatus, findProtocol, formatDuration } from '../../../shared/fasting';
import {
  daysUntil,
  findMedication,
  GLP1_MEDICATIONS,
  INJECTION_SITES,
  nextDoseDue,
  suggestNextSite,
  type InjectionSite,
} from '../../../shared/glp1';
import { calcDailyTargets } from '../../../shared/goals';
import { Button, Card, Chip, ProgressBar, Ring, SectionLabel, Title } from '../components/ui';
import { newId, today, useStore } from '../store';
import { colors, radius, space } from '../theme';

export function TrackersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Title>Привычки</Title>
      <WaterCard />
      <StepsCard />
      <FastingCard />
      <WeightCard />
      <Glp1Card />
    </ScrollView>
  );
}

const fmtTime = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/* ---------- Water ---------- */

function WaterCard() {
  const { state, dispatch } = useStore();
  const t = calcDailyTargets(state.profile!);
  const day = today();
  const ml = state.waterMl[day] ?? 0;
  const glasses = Math.round(ml / 250);
  return (
    <Card>
      <SectionLabel>💧 Вода</SectionLabel>
      <View style={styles.rowCenter}>
        <Ring size={88} stroke={9} progress={ml / t.waterMl} color={colors.water}>
          <Text style={styles.ringSmall}>{(ml / 1000).toFixed(1)} л</Text>
        </Ring>
        <View style={{ flex: 1 }}>
          <Text style={styles.big}>
            {ml} <Text style={styles.muted}>/ {t.waterMl} мл</Text>
          </Text>
          <Text style={styles.muted}>≈ {glasses} стак.</Text>
        </View>
      </View>
      <View style={[styles.row, { marginTop: space(3) }]}>
        {NUTRITION_CONFIG.waterQuickAdd.map((v) => (
          <Button key={v} label={`+${v}`} color={colors.water} style={{ flex: 1 }} onPress={() => dispatch({ type: 'addWater', day, ml: v })} />
        ))}
        <Button label="−250" variant="secondary" color={colors.water} onPress={() => dispatch({ type: 'addWater', day, ml: -250 })} />
      </View>
    </Card>
  );
}

/* ---------- Steps ---------- */

function StepsCard() {
  const { state, dispatch } = useStore();
  const t = calcDailyTargets(state.profile!);
  const day = today();
  const [sensorSteps, setSensorSteps] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const lastWatch = useRef(0);
  const manual = state.manualSteps[day] ?? 0;

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      if (Platform.OS === 'web' || !(await Pedometer.isAvailableAsync().catch(() => false))) return;
      const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
      if (!perm?.granted || cancelled) return;
      if (Platform.OS === 'ios') {
        // iOS keeps a history: read today's total directly.
        const r = await Pedometer.getStepCountAsync(startOfDay(day), new Date()).catch(() => null);
        if (r && !cancelled) setSensorSteps(r.steps);
      }
      // Android has no history API: count live steps while the app is open and add them to today's log.
      sub = Pedometer.watchStepCount(({ steps }) => {
        if (Platform.OS === 'ios') {
          setSensorSteps((s) => (s ?? 0) + steps - lastWatch.current);
        } else {
          dispatch({ type: 'setSteps', day, steps: (state.manualSteps[day] ?? 0) + steps - lastWatch.current });
        }
        lastWatch.current = steps;
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const steps = sensorSteps ?? manual;
  const kcal = Math.round(steps * 0.04 * (state.profile!.weightKg / 70));

  return (
    <Card>
      <SectionLabel>👟 Шаги</SectionLabel>
      <ProgressBar label={sensorSteps != null ? 'С датчика телефона' : 'Сегодня'} value={steps} target={t.steps} unit="шагов" color={colors.primary} />
      <Text style={[styles.muted, { marginTop: 4 }]}>≈ {kcal} ккал активности</Text>
      {sensorSteps == null && (
        <View style={[styles.row, { marginTop: space(3) }]}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="number-pad"
            placeholder="Ввести вручную (из часов)"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
          />
          <Button
            label="Сохранить"
            disabled={!(Number(input) >= 0 && input !== '')}
            onPress={() => {
              dispatch({ type: 'setSteps', day, steps: Math.round(Number(input)) });
              setInput('');
            }}
          />
        </View>
      )}
    </Card>
  );
}

/* ---------- Fasting ---------- */

function FastingCard() {
  const { state, dispatch } = useStore();
  const { protocolId, startedAt, history } = state.fasting;
  const protocol = findProtocol(protocolId);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const status = startedAt ? fastingStatus(new Date(startedAt), protocol, now) : null;

  return (
    <Card>
      <SectionLabel>⏱️ Интервальное голодание</SectionLabel>
      <View style={styles.wrap}>
        {FASTING_PROTOCOLS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            color={colors.fasting}
            active={p.id === protocolId}
            onPress={() => !startedAt && dispatch({ type: 'setFastingProtocol', protocolId: p.id })}
          />
        ))}
      </View>
      {status ? (
        <View style={styles.rowCenter}>
          <Ring size={130} stroke={12} progress={status.progress} color={status.phase === 'completed' ? colors.primary : colors.fasting}>
            <Text style={styles.timer}>{formatDuration(status.elapsedMs)}</Text>
            <Text style={styles.mutedSmall}>{Math.round(status.progress * 100)} %</Text>
          </Ring>
          <View style={{ flex: 1 }}>
            <Text style={styles.bold}>{status.phase === 'completed' ? 'Цель достигнута! 🎉' : `Осталось ${formatDuration(status.remainingMs)}`}</Text>
            <Text style={styles.muted}>Стадия: {fastingStage(status.elapsedMs)}</Text>
            <Text style={styles.muted}>Окно питания с {fmtTime(status.goalEndsAt)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>
          {protocol.fastHours} ч голодания, {protocol.eatHours} ч окно питания.
          {history[0] ? ` Последний пост: ${formatDuration(new Date(history[0].endedAt).getTime() - new Date(history[0].startedAt).getTime()).slice(0, 5)} ч.` : ''}
        </Text>
      )}
      <Button
        style={{ marginTop: space(3) }}
        label={startedAt ? 'Завершить голодание' : 'Начать голодание'}
        color={startedAt ? colors.primary : colors.fasting}
        onPress={() => dispatch({ type: startedAt ? 'endFast' : 'startFast', at: new Date().toISOString() })}
      />
    </Card>
  );
}

/* ---------- Weight ---------- */

function WeightCard() {
  const { state, dispatch } = useStore();
  const [input, setInput] = useState('');
  const recent = state.weights.slice(-7).reverse();
  const first = state.weights[0];
  const last = state.weights[state.weights.length - 1];
  const change = first && last ? last.kg - first.kg : 0;
  const target = state.profile?.targetWeightKg;
  const value = Number(input.replace(',', '.'));

  return (
    <Card>
      <SectionLabel>⚖️ Вес</SectionLabel>
      <View style={styles.rowCenter}>
        <Text style={styles.big}>{(last?.kg ?? state.profile!.weightKg).toFixed(1)} кг</Text>
        {state.weights.length > 1 && (
          <Text style={[styles.bold, { color: change <= 0 ? colors.primary : colors.warn }]}>
            {change > 0 ? '+' : ''}
            {change.toFixed(1)} кг с начала
          </Text>
        )}
      </View>
      {target ? <Text style={styles.muted}>Цель: {target} кг</Text> : null}
      <View style={[styles.row, { marginTop: space(3) }]}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          keyboardType="decimal-pad"
          placeholder="Вес сегодня, кг"
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
        />
        <Button
          label="Записать"
          disabled={!(value >= 30 && value <= 300)}
          onPress={() => {
            dispatch({ type: 'logWeight', day: today(), kg: Math.round(value * 10) / 10 });
            setInput('');
          }}
        />
      </View>
      {recent.map((w) => (
        <View key={w.day} style={styles.listRow}>
          <Text style={styles.muted}>{humanDay(w.day)}</Text>
          <Text style={styles.bold}>{w.kg.toFixed(1)} кг</Text>
        </View>
      ))}
    </Card>
  );
}

/* ---------- GLP-1 ---------- */

function Glp1Card() {
  const { state, dispatch } = useStore();
  const { medicationId, doses } = state.glp1;
  const med = medicationId ? findMedication(medicationId) : undefined;
  const myDoses = doses.filter((d) => d.medicationId === medicationId);
  const [doseMg, setDoseMg] = useState<number | null>(myDoses[0]?.doseMg ?? null);
  const [site, setSite] = useState<InjectionSite>(suggestNextSite(myDoses));
  const [effects, setEffects] = useState('');
  const injectable = med && !med.substance.includes('таблетки');

  if (!state.profile?.onGlp1 && !medicationId) {
    return (
      <Card>
        <SectionLabel>💉 Препараты GLP-1</SectionLabel>
        <Text style={styles.muted}>Включите «Принимаю GLP-1» в профиле, чтобы вести журнал инъекций и получать норму белка с учётом препарата.</Text>
      </Card>
    );
  }

  const due = med && myDoses[0] ? nextDoseDue(myDoses[0], med) : null;
  const left = due ? daysUntil(due, new Date()) : null;

  return (
    <Card>
      <SectionLabel>💉 Препараты GLP-1</SectionLabel>
      <View style={styles.wrap}>
        {GLP1_MEDICATIONS.map((m) => (
          <Chip
            key={m.id}
            label={m.name}
            color={colors.glp1}
            active={m.id === medicationId}
            onPress={() => {
              dispatch({ type: 'setGlp1Medication', medicationId: m.id });
              setDoseMg(null);
            }}
          />
        ))}
      </View>

      {med && (
        <>
          <Text style={styles.muted}>
            {med.substance}, {med.frequency === 'weekly' ? 'раз в неделю' : 'ежедневно'}
          </Text>
          {due && (
            <View style={[styles.dueBox, left! <= 0 && { backgroundColor: '#FCE9E8' }]}>
              <Text style={styles.bold}>
                {left! < 0 ? `Доза просрочена на ${-left!} дн.` : left === 0 ? 'Доза сегодня' : `Следующая доза через ${left} дн.`}
              </Text>
              <Text style={styles.muted}>{fmtDate(due)}</Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: space(3) }]}>Доза, мг</Text>
          <View style={styles.wrap}>
            {med.doses.map((d) => (
              <Chip key={d} label={String(d).replace('.', ',')} color={colors.glp1} active={doseMg === d} onPress={() => setDoseMg(d)} />
            ))}
          </View>

          {injectable && (
            <>
              <Text style={styles.label}>Место инъекции (рекомендуем: {suggestNextSite(myDoses)})</Text>
              <View style={styles.wrap}>
                {INJECTION_SITES.map((s) => (
                  <Chip key={s} label={s} color={colors.glp1} active={site === s} onPress={() => setSite(s)} />
                ))}
              </View>
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Самочувствие / побочные эффекты (необязательно)"
            placeholderTextColor={colors.muted}
            value={effects}
            onChangeText={setEffects}
          />
          <Button
            label="Записать приём"
            color={colors.glp1}
            disabled={doseMg == null}
            onPress={() => {
              dispatch({
                type: 'logGlp1Dose',
                dose: {
                  id: newId(),
                  medicationId: med.id,
                  doseMg: doseMg!,
                  site: injectable ? site : undefined,
                  takenAt: new Date().toISOString(),
                  sideEffects: effects.trim() || undefined,
                },
              });
              setEffects('');
              setSite(INJECTION_SITES[(INJECTION_SITES.indexOf(site) + 1) % INJECTION_SITES.length]);
            }}
          />

          {myDoses.slice(0, 5).map((d) => (
            <View key={d.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>
                  {String(d.doseMg).replace('.', ',')} мг{d.site ? ` · ${d.site}` : ''}
                </Text>
                {d.sideEffects ? <Text style={styles.muted}>{d.sideEffects}</Text> : null}
              </View>
              <Text style={styles.muted}>
                {fmtDate(new Date(d.takenAt))}, {fmtTime(new Date(d.takenAt))}
              </Text>
            </View>
          ))}
          <Text style={[styles.mutedSmall, { marginTop: space(2) }]}>
            Журнал не заменяет назначения врача. Дозировку меняйте только по согласованию с ним.
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space(4), paddingBottom: space(12) },
  row: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  rowCenter: { flexDirection: 'row', gap: space(4), alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: space(1) },
  big: { fontSize: 26, fontWeight: '800', color: colors.text },
  bold: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  label: { color: colors.muted, fontSize: 13, marginBottom: space(2) },
  ringSmall: { fontSize: 16, fontWeight: '800', color: colors.water },
  timer: { fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
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
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dueBox: { backgroundColor: '#EFEAFE', borderRadius: radius.sm, padding: space(3), marginTop: space(2) },
});
