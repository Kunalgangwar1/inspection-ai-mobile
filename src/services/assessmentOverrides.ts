import { FirebaseError } from 'firebase/app';
import {
  deleteField,
  doc,
  FieldPath,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import type { EvidenceState } from '@/services/taxonomy';

function getAssessmentReference(assessmentId: string) {
  if (assessmentId.trim().length === 0) {
    throw new Error('Assessment ID is required.');
  }

  return doc(db, 'assessments', assessmentId);
}

function getOverrideFieldPath(evidenceId: string) {
  if (evidenceId.length === 0) {
    throw new Error('Evidence ID is required.');
  }

  return new FieldPath('userOverrides', evidenceId);
}

export async function setEvidenceOverride(
  assessmentId: string,
  evidenceId: string,
  state: EvidenceState,
) {
  await updateDoc(
    getAssessmentReference(assessmentId),
    getOverrideFieldPath(evidenceId),
    state,
  );
}

export async function clearEvidenceOverride(
  assessmentId: string,
  evidenceId: string,
) {
  await updateDoc(
    getAssessmentReference(assessmentId),
    getOverrideFieldPath(evidenceId),
    deleteField(),
  );
}

export function getAssessmentOverrideErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
      case 'firestore/permission-denied':
        return 'You do not have permission to change this result.';
      case 'unauthenticated':
      case 'firestore/unauthenticated':
        return 'Your session has expired. Please sign in again.';
      case 'unavailable':
      case 'firestore/unavailable':
        return 'Unable to save while Firestore is unavailable. Check your connection.';
    }
  }

  return 'Unable to save the inspector decision. Please try again.';
}
