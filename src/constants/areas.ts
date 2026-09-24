export type AreaId =
  | 'exterior'
  | 'lobby'
  | 'walk-in'
  | 'backroom'
  | 'production';

export type Area = Readonly<{
  id: AreaId;
  displayName: string;
}>;

export const AREAS: readonly Area[] = [
  { id: 'exterior', displayName: 'Exterior & Parking Lot' },
  { id: 'lobby', displayName: 'Lobby & Entry' },
  { id: 'walk-in', displayName: 'Walk-in & Dry Storage' },
  { id: 'backroom', displayName: 'Restrooms & Back of House' },
  { id: 'production', displayName: 'Production & Make Line Area' },
];

export function getAreaById(areaId: string) {
  return AREAS.find((area) => area.id === areaId);
}
