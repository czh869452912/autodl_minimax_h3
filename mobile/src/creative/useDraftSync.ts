import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {creativeError} from './creativeError';
import { creativeService } from './runtime';
import type { CreativeDraft } from './drafts';

export function useDraftSync(id: string, draft: CreativeDraft | undefined, dirty: boolean, busy: boolean, load: (canApply?: () => boolean) => Promise<void>, onError: (message: string) => void) {
  const [conflict, setConflict] = useState(false);
  const current = useRef({ draft, dirty, busy, load, onError });
  current.current = { draft, dirty, busy, load, onError };
  useFocusEffect(useCallback(() => {
    let active = true, reading = false;
    const check = async () => {
      if (reading || current.current.busy) return;
      reading = true;
      try {
        const row = await creativeService().draft(id);
        if (!active || current.current.busy) return;
        if (!row) throw new Error('草稿不存在或已移除，请返回草稿列表');
        const before = current.current;
        if (!before.draft || row.revision !== before.draft.revision || row.state !== before.draft.state) {
          if (before.dirty) { setConflict(true); return; }
          await before.load(() => active && !current.current.dirty && !current.current.busy);
        }
      } catch (e) { if (active) current.current.onError(creativeError(e,'草稿读取失败')); }
      finally { reading = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [id]));
  const reload = async () => { await current.current.load(); setConflict(false); current.current.onError(''); };
  const assertCurrent = async () => {
    const row = await creativeService().draft(id);
    if (!row || row.revision !== current.current.draft?.revision || row.state !== current.current.draft?.state) {
      setConflict(true); throw new Error('草稿已在其他入口更新，请先载入最新内容');
    }
  };
  return { conflict, reload, assertCurrent };
}
