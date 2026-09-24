import taxonomyData from '@/data/taxonomy.json';

export type TaxonomyEvidence = Readonly<{
  id: string;
  description: string;
}>;

export type TaxonomyItem = Readonly<{
  id: string;
  name: string;
  area: string;
  required_evidence: readonly TaxonomyEvidence[];
}>;

export type EvidenceState = 'COMPLIANT' | 'NON_COMPLIANT';

export type EvidenceTaxonomyLookup = Readonly<{
  evidenceId: string;
  description: string;
  itemId: string;
  itemName: string;
  area: string;
}>;

export type EvidenceResultViewModel = Readonly<{
  evidenceId: string;
  state: EvidenceState;
  description: string;
  itemId: string | null;
  itemName: string;
  area: string | null;
}>;

export type InspectionItemResultGroup = Readonly<{
  itemId: string;
  itemName: string;
  area: string;
  evidence: readonly EvidenceResultViewModel[];
}>;

export type AreaEvidenceResults = Readonly<{
  groups: readonly InspectionItemResultGroup[];
  unknownEvidence: readonly EvidenceResultViewModel[];
}>;

type IndexedEvidenceLookup = EvidenceTaxonomyLookup &
  Readonly<{
    itemIndex: number;
    evidenceIndex: number;
  }>;

/**
 * Derived from the backend's canonical taxonomy/taxonomy.json.
 * Canonical SHA-256 at derivation: 6f9caddbcb40094b29d97e953d10d63cda03067b44b90f7e65a3800415937b5c
 * Only the item and evidence fields needed by the Phase 9 mobile UI are copied.
 */
const taxonomy: readonly TaxonomyItem[] = taxonomyData;
const evidenceById = new Map<string, IndexedEvidenceLookup>();
const warnedUnknownEvidenceIds = new Set<string>();

taxonomy.forEach((item, itemIndex) => {
  item.required_evidence.forEach((evidence, evidenceIndex) => {
    if (evidenceById.has(evidence.id)) {
      throw new Error(`Duplicate taxonomy evidence ID: ${evidence.id}`);
    }

    evidenceById.set(evidence.id, {
      evidenceId: evidence.id,
      description: evidence.description,
      itemId: item.id,
      itemName: item.name,
      area: item.area,
      itemIndex,
      evidenceIndex,
    });
  });
});

export function getEvidenceTaxonomy(evidenceId: string) {
  return evidenceById.get(evidenceId);
}

export function mapEvidenceResultsForArea(
  results: Record<string, EvidenceState>,
  area: string,
): AreaEvidenceResults {
  const groupsByItemId = new Map<
    string,
    {
      itemIndex: number;
      itemId: string;
      itemName: string;
      area: string;
      evidence: (
        EvidenceResultViewModel & Readonly<{ evidenceIndex: number }>
      )[];
    }
  >();
  const unknownEvidence: EvidenceResultViewModel[] = [];

  Object.entries(results).forEach(([evidenceId, state]) => {
    const lookup = evidenceById.get(evidenceId);

    if (!lookup) {
      unknownEvidence.push({
        evidenceId,
        state,
        description: 'Unknown evidence',
        itemId: null,
        itemName: 'Unmapped evidence',
        area: null,
      });

      if (__DEV__ && !warnedUnknownEvidenceIds.has(evidenceId)) {
        warnedUnknownEvidenceIds.add(evidenceId);
        console.warn(`[taxonomy] Unknown evidence ID: ${evidenceId}`);
      }

      return;
    }

    if (lookup.area !== area) {
      return;
    }

    const viewModel = {
      evidenceId,
      state,
      description: lookup.description,
      itemId: lookup.itemId,
      itemName: lookup.itemName,
      area: lookup.area,
      evidenceIndex: lookup.evidenceIndex,
    };
    const existingGroup = groupsByItemId.get(lookup.itemId);

    if (existingGroup) {
      existingGroup.evidence.push(viewModel);
      return;
    }

    groupsByItemId.set(lookup.itemId, {
      itemIndex: lookup.itemIndex,
      itemId: lookup.itemId,
      itemName: lookup.itemName,
      area: lookup.area,
      evidence: [viewModel],
    });
  });

  const groups = Array.from(groupsByItemId.values())
    .sort((first, second) => first.itemIndex - second.itemIndex)
    .map(({ itemIndex: _itemIndex, ...group }) => ({
      ...group,
      evidence: group.evidence
        .sort((first, second) => first.evidenceIndex - second.evidenceIndex)
        .map(({ evidenceIndex: _evidenceIndex, ...evidence }) => evidence),
    }));

  return {
    groups,
    unknownEvidence: unknownEvidence.sort((first, second) =>
      first.evidenceId.localeCompare(second.evidenceId),
    ),
  };
}
