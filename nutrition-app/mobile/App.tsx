/** Root: onboarding gate + bottom tab navigation. */
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DiaryScreen } from './src/screens/DiaryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { TrackersScreen } from './src/screens/TrackersScreen';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';

type Tab = 'diary' | 'scan' | 'trackers' | 'profile';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'diary', label: 'Дневник', icon: '📒' },
  { id: 'scan', label: 'Сканер', icon: '✨' },
  { id: 'trackers', label: 'Привычки', icon: '💧' },
  { id: 'profile', label: 'Цели', icon: '🎯' },
];

function Shell() {
  const { state, ready } = useStore();
  const [tab, setTab] = useState<Tab>('diary');

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!state.profile) return <ProfileScreen onboarding />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'diary' && <DiaryScreen onAdd={() => setTab('scan')} />}
        {tab === 'scan' && <ScanScreen onDone={() => setTab('diary')} />}
        {tab === 'trackers' && <TrackersScreen />}
        {tab === 'profile' && <ProfileScreen onSaved={() => setTab('diary')} />}
      </View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            style={styles.tab}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabIcon, tab !== t.id && { opacity: 0.5 }]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.id && { color: colors.primary }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar style="dark" />
          <Shell />
        </SafeAreaView>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: 2 },
});
