import { auth } from '@/services/firebase';

const EVIDENCE_SEGMENTS_ENDPOINT =
  'https://us-central1-inspection-ai-dev-12345.cloudfunctions.net/get-segments-service';

export type EvidenceSegment = Readonly<{
  signedUrl: string;
  segmentPath: string;
}>;

export type EvidenceSegmentsResponse = Readonly<{
  segments: readonly EvidenceSegment[];
  assessmentId: string;
  evidenceId: string;
}>;

export type EvidenceSegmentsErrorCode =
  | 'authentication'
  | 'invalid-request'
  | 'forbidden'
  | 'not-found'
  | 'method-not-allowed'
  | 'service-unavailable'
  | 'network'
  | 'malformed-response';

export class EvidenceSegmentsError extends Error {
  readonly code: EvidenceSegmentsErrorCode;
  readonly status: number | null;

  constructor(
    code: EvidenceSegmentsErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'EvidenceSegmentsError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createHttpError(status: number) {
  switch (status) {
    case 400:
      return new EvidenceSegmentsError(
        'invalid-request',
        'The evidence clip request is invalid.',
        status,
      );
    case 401:
      return new EvidenceSegmentsError(
        'authentication',
        'Your session has expired. Please sign in again.',
        status,
      );
    case 403:
      return new EvidenceSegmentsError(
        'forbidden',
        'You are not authorized to view this assessment.',
        status,
      );
    case 404:
      return new EvidenceSegmentsError(
        'not-found',
        'The assessment could not be found.',
        status,
      );
    case 405:
      return new EvidenceSegmentsError(
        'method-not-allowed',
        'The evidence clip request method was rejected.',
        status,
      );
    default:
      return new EvidenceSegmentsError(
        'service-unavailable',
        'The evidence clip service is unavailable.',
        status,
      );
  }
}

export async function getEvidenceSegments(
  assessmentId: string,
  evidenceId: string,
): Promise<EvidenceSegmentsResponse> {
  const normalizedAssessmentId = assessmentId.trim();
  const normalizedEvidenceId = evidenceId.trim();

  if (!normalizedAssessmentId || !normalizedEvidenceId) {
    throw new EvidenceSegmentsError(
      'invalid-request',
      'Assessment and evidence IDs are required.',
    );
  }

  const user = auth.currentUser;

  if (!user) {
    throw new EvidenceSegmentsError(
      'authentication',
      'You must be signed in to view evidence clips.',
    );
  }

  let idToken: string;

  try {
    idToken = await user.getIdToken();
  } catch {
    throw new EvidenceSegmentsError(
      'authentication',
      'Your session could not be refreshed. Please sign in again.',
    );
  }

  const query = new URLSearchParams({
    assessment_id: normalizedAssessmentId,
    evidence_id: normalizedEvidenceId,
  });

  let response: Response;

  try {
    response = await fetch(`${EVIDENCE_SEGMENTS_ENDPOINT}?${query}`, {
      method: 'GET',
      headers: {
        'Firebase-Token': `Bearer ${idToken}`,
      },
    });
  } catch {
    throw new EvidenceSegmentsError(
      'network',
      'The evidence clip could not be loaded. Check your connection and retry.',
    );
  }

  if (!response.ok) {
    throw createHttpError(response.status);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new EvidenceSegmentsError(
      'malformed-response',
      'The evidence clip service returned an invalid response.',
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.segments)) {
    throw new EvidenceSegmentsError(
      'malformed-response',
      'The evidence clip service returned an invalid response.',
    );
  }

  const segments = payload.segments.map((segment): EvidenceSegment => {
    if (
      !isRecord(segment) ||
      typeof segment.signed_url !== 'string' ||
      segment.signed_url.trim().length === 0
    ) {
      throw new EvidenceSegmentsError(
        'malformed-response',
        'The evidence clip service returned an invalid segment.',
      );
    }

    return {
      signedUrl: segment.signed_url,
      segmentPath:
        typeof segment.segment_path === 'string' ? segment.segment_path : '',
    };
  });

  return {
    segments,
    assessmentId:
      typeof payload.assessment_id === 'string'
        ? payload.assessment_id
        : normalizedAssessmentId,
    evidenceId:
      typeof payload.evidence_id === 'string'
        ? payload.evidence_id
        : normalizedEvidenceId,
  };
}
