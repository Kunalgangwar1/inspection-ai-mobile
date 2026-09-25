import { AREAS, type AreaId } from '@/constants/areas';
import {
  getEffectiveEvidenceState,
  getEvidenceTaxonomy,
  type EvidenceState,
} from '@/services/taxonomy';

export type AreaCompletionStatus =
  | 'not-started'
  | 'analysis-complete';

export type AreaSummary = Readonly<{
  areaId: AreaId;
  displayName: string;
  status: AreaCompletionStatus;
  isComplete: boolean;
  aiEvidenceCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  overrideCount: number;
}>;

export type AssessmentSummary = Readonly<{
  areas: readonly AreaSummary[];
  areasComplete: number;
  totalAreas: number;
  evidenceReviewed: number;
  compliantCount: number;
  nonCompliantCount: number;
  overrideCount: number;
}>;

type DeriveAssessmentSummaryInput = Readonly<{
  results?: Readonly<Record<string, EvidenceState>>;
  userOverrides?: Readonly<Record<string, EvidenceState>>;
  completedAreas?: Readonly<Partial<Record<AreaId, unknown>>>;
}>;

type MutableAreaSummary = {
  areaId: AreaId;
  displayName: string;
  status: AreaCompletionStatus;
  isComplete: boolean;
  aiEvidenceCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  overrideCount: number;
};

const areaIdByTaxonomyName = new Map(
  AREAS.map((area) => [area.displayName, area.id] as const),
);

export function deriveAssessmentSummary({
  results = {},
  userOverrides = {},
  completedAreas = {},
}: DeriveAssessmentSummaryInput): AssessmentSummary {
  const areaSummaries = new Map<AreaId, MutableAreaSummary>();

  AREAS.forEach((area) => {
    const isComplete = completedAreas[area.id] !== undefined;

    areaSummaries.set(area.id, {
      areaId: area.id,
      displayName: area.displayName,
      status: isComplete ? 'analysis-complete' : 'not-started',
      isComplete,
      aiEvidenceCount: 0,
      compliantCount: 0,
      nonCompliantCount: 0,
      overrideCount: 0,
    });
  });

  Object.entries(results).forEach(([evidenceId, aiState]) => {
    const taxonomyEvidence = getEvidenceTaxonomy(evidenceId);

    if (!taxonomyEvidence) {
      return;
    }

    const areaId = areaIdByTaxonomyName.get(taxonomyEvidence.area);

    if (!areaId) {
      return;
    }

    const areaSummary = areaSummaries.get(areaId);

    if (!areaSummary) {
      return;
    }

    const overrideState = userOverrides[evidenceId];
    const effectiveState = getEffectiveEvidenceState(
      aiState,
      overrideState,
    );

    areaSummary.aiEvidenceCount += 1;

    if (effectiveState === 'COMPLIANT') {
      areaSummary.compliantCount += 1;
    } else {
      areaSummary.nonCompliantCount += 1;
    }

    if (overrideState !== undefined) {
      areaSummary.overrideCount += 1;
    }
  });

  const areas = AREAS.map((area) => {
    const summary = areaSummaries.get(area.id);

    if (!summary) {
      throw new Error(`Missing summary for area: ${area.id}`);
    }

    return summary;
  });

  return {
    areas,
    areasComplete: areas.filter((area) => area.isComplete).length,
    totalAreas: AREAS.length,
    evidenceReviewed: areas.reduce(
      (total, area) => total + area.aiEvidenceCount,
      0,
    ),
    compliantCount: areas.reduce(
      (total, area) => total + area.compliantCount,
      0,
    ),
    nonCompliantCount: areas.reduce(
      (total, area) => total + area.nonCompliantCount,
      0,
    ),
    overrideCount: areas.reduce(
      (total, area) => total + area.overrideCount,
      0,
    ),
  };
}
