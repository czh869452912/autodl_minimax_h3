import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createTaskListSession, type TaskListSession } from './taskListSession';
import { taskProjectionRepository } from './taskServices';

export function useTaskListSession(provided?: TaskListSession) {
  const [owned] = useState(() => provided ? undefined : createTaskListSession({ repository: taskProjectionRepository }));
  const session = provided ?? owned!;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useFocusEffect(useCallback(() => { session.setVisible(true); return () => session.setVisible(false); }, [session]));
  useEffect(() => () => { owned?.dispose(); }, [owned]);
  return { session, snapshot };
}
