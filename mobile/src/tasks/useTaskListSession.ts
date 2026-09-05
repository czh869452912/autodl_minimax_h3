import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createTaskListSession, type TaskListSession } from './taskListSession';
import { taskProjectionRepository } from './taskServices';

export function useTaskListSession(provided?: TaskListSession) {
  const [owned] = useState(() => provided ? undefined : createTaskListSession({ repository: taskProjectionRepository }));
  const session = provided ?? owned!;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useFocusEffect(useCallback(() => { session.setVisible(true); return () => session.setVisible(false); }, [session]));
  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    // React replays effects in StrictMode. Defer final disposal until it is clear
    // that this cleanup was an actual unmount, rather than a replay.
    return () => { queueMicrotask(() => { if (lifetime.current === generation) owned?.dispose(); }); };
  }, [owned]);
  return { session, snapshot };
}
