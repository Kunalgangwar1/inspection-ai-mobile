import { useEffect, useState } from 'react';
import {
  doc,
  onSnapshot,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';

import { AREAS, type AreaId } from '@/constants/areas';
import { db } from '@/services/firebase';
import type { EvidenceState } from '@/services/taxonomy';

const SAFE_ASSESSMENT_ID_PATTERN = /^[A-Za-z0-9-]+$/;

export type EvidenceResult = EvidenceState;
export type UserOverrides = Record<string, EvidenceState>;
export type CompletedAreas = Partial<Record<AreaId, Timestamp>>;

export type AssessmentRealtimeResult = Readonly<{
  evaluation_id?: string;
  results?: Record<string, EvidenceResult>;
  userOverrides: UserOverrides;
  completedAreas: CompletedAreas;
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
    return { userOverrides: {}, completedAreas: {} };
  }

  const result: {
    evaluation_id?: string;
    results?: Record<string, EvidenceResult>;
    userOverrides: UserOverrides;
    completedAreas: CompletedAreas;
  } = { userOverrides: {}, completedAreas: {} };

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

  if (
    typeof data.completedAreas === 'object' &&
    data.completedAreas !== null &&
    !Array.isArray(data.completedAreas)
  ) {
    AREAS.forEach((area) => {
      const completedAt = data.completedAreas[area.id];

      if (completedAt instanceof Timestamp) {
        result.completedAreas[area.id] = completedAt;
      }
    });
  }

  return result;
}

export function useAssessmentRealtime(
  assessmentId: string,
  listenerKey: string | null,
) {
  const hasValidAssessmentId =
    SAFE_ASSESSMENT_ID_PATTERN.test(assessmentId);
  const subscriptionKey = listenerKey
    ? `${assessmentId}:${listenerKey}`
    : null;
  const [state, setState] = useState<ListenerState>(EMPTY_LISTENER_STATE);

  useEffect(() => {
    if (!subscriptionKey || !hasValidAssessmentId) {
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
          listenerKey: subscriptionKey,
          result: parseAssessmentResult(
            snapshot.exists() ? snapshot.data() : undefined,
          ),
          error: null,
        });
      },
      () => {
        setState({
          listenerKey: subscriptionKey,
          result: null,
          error:
            'Unable to receive analysis updates from Firestore. Please try again.',
        });
      },
    );
  }, [assessmentId, hasValidAssessmentId, subscriptionKey]);

  if (subscriptionKey && !hasValidAssessmentId) {
    return {
      listenerKey: subscriptionKey,
      result: null,
      error: 'The assessment link is invalid.',
    };
  }

  return subscriptionKey && state.listenerKey === subscriptionKey
    ? state
    : EMPTY_LISTENER_STATE;
}
