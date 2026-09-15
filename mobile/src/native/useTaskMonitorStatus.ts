import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getTaskMonitorStatus, subscribeTaskMonitorStatus, type TaskMonitorStatus } from './taskMonitor';

export function useTaskMonitorStatus() {
  const [status, setStatus] = useState<TaskMonitorStatus>({ running: false, taskIds: [] });
  useFocusEffect(useCallback(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void getTaskMonitorStatus().then(value => { if (active && revision === request) setStatus(value); }).catch(() => undefined);
    };
    const unsubscribe = subscribeTaskMonitorStatus(value => { revision++; if (active) setStatus(value); });
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    refresh();
    return () => { active = false; unsubscribe(); app.remove(); };
  }, []));
  return { status, setStatus };
}
