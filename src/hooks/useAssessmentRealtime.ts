import { useEffect, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';

import { db } from '@/services/firebase';
import type { EvidenceState } from '@/services/taxonomy';

export type EvidenceResult = EvidenceState;
export type UserOverrides = Record<string, EvidenceState>;

export type AssessmentRealtimeResult = Readonly<{
  evaluation_id?: string;
  results?: Record<string, EvidenceResult>;
  userOverrides: UserOverrides;
}>;

type ListenerState = Readonly<{
  listenerKey: string | null;
  result: AssessmentRealtimeResult | null;
  error: string | null;
}>;

const EMPTY_LISTENER_STATE: ListenerState = {
  listenerKey: null,
  result: null,
  error: null,
};

function isEvidenceResult(value: unknown): value is EvidenceResult {
  return value === 'COMPLIANT' || value === 'NON_COMPLIANT';
}

function parseAssessmentResult(
  data: DocumentData | undefined,
): AssessmentRealtimeResult {
  if (!data) {
    return { userOverrides: {} };
  }

  const result: {
    evaluation_id?: string;
    results?: Record<string, EvidenceResult>;
    userOverrides: UserOverrides;
  } = { userOverrides: {} };

  if (typeof data.evaluation_id === 'string') {
    result.evaluation_id = data.evaluation_id;
  }

  if (
    typeof data.results === 'object' &&
    data.results !== null &&
    !Array.isArray(data.results) &&
    Object.values(data.results).every(isEvidenceResult)
  ) {
    result.results = { ...data.results } as Record<string, EvidenceResult>;
  }

  if (
    typeof data.userOverrides === 'object' &&
    data.userOverrides !== null &&
    !Array.isArray(data.userOverrides) &&
    Object.values(data.userOverrides).every(isEvidenceResult)
  ) {
    result.userOverrides = {
      ...data.userOverrides,
    } as UserOverrides;
  }

  return result;
}

export function useAssessmentRealtime(
  assessmentId: string,
  listenerKey: string | null,
) {
  const [state, setState] = useState<ListenerState>(EMPTY_LISTENER_STATE);

  useEffect(() => {
    if (!listenerKey) {
      return;
    }

    const assessmentRef = doc(db, 'assessments', assessmentId);

    return onSnapshot(
      assessmentRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) {
          return;
        }

        setState({
          listenerKey,
          result: parseAssessmentResult(
            snapshot.exists() ? snapshot.data() : undefined,
          ),
          error: null,
        });
      },
      () => {
        setState({
          listenerKey,
          result: null,
          error:
            'Unable to receive analysis updates from Firestore. Please try again.',
        });
      },
    );
  }, [assessmentId, listenerKey]);

  return listenerKey && state.listenerKey === listenerKey
    ? state
    : EMPTY_LISTENER_STATE;
}
