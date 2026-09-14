import { useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createTaskListSession, type TaskListSession } from './taskListSession';
import { getTaskServices } from './taskServices';

export function useTaskListSession(provided?: TaskListSession, filter: 'all' | 'active' | 'failed' = 'all') {
  const owned = useMemo(() => { const repository = getTaskServices().taskProjectionRepository; return provided ? undefined : createTaskListSession({ repository: repository.forFilter?.(filter) ?? repository }); }, [provided, filter]);
  const currentOwned = useRef(owned); currentOwned.current = owned;
  const session = provided ?? owned!;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useFocusEffect(useCallback(() => { session.setVisible(true); return () => session.setVisible(false); }, [session]));
  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    // React replays effects in StrictMode. Defer final disposal until it is clear
    // that this cleanup was an actual unmount, rather than a replay.
    return () => { queueMicrotask(() => { if (lifetime.current === generation || currentOwned.current !== owned) owned?.dispose(); }); };
  }, [owned]);
  return { session, snapshot };
}
