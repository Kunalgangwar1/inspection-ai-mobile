import * as Crypto from 'expo-crypto';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

const ASSESSMENTS_COLLECTION = 'assessments';

export async function createAssessment(userId: string) {
  if (!userId) {
    throw new Error('A user ID is required to create an assessment.');
  }

  const assessmentId = Crypto.randomUUID();

  await setDoc(
    doc(db, ASSESSMENTS_COLLECTION, assessmentId),
    {
      created_at: serverTimestamp(),
      user_id: userId,
    },
    { merge: true },
  );

  return assessmentId;
}
