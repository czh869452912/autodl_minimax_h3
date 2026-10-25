import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { unknownTaskReviewed } from './taskRecovery';

/** A review permits a new manual attempt, without changing the original job. */
export function useWorkbenchJobPending(jobId: string | null | undefined, status: string) {
  const [reviewedJob, setReviewedJob] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    setReviewedJob('');
    if (jobId && status === 'UNKNOWN') {
      void unknownTaskReviewed(getDatabase(), jobId).then(reviewed => {
        if (active) setReviewedJob(reviewed ? jobId : '');
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [jobId, status]));
  return Boolean(jobId && (!status || ['VALIDATING', 'READY_TO_SUBMIT', 'SUBMITTING', 'QUEUED', 'RUNNING'].includes(status)
    || status === 'UNKNOWN' && reviewedJob !== jobId));
}
