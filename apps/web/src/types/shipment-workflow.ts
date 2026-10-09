export interface ShipmentDraft {
  product: string; lot: string; transport: string; origin: string; destination: string;
  start: string; end: string; reference: string; sop: string; notes: string; profileId: string;
  originType: 'SYNTHETIC';
}
export interface HandoverDraft {
  timestampRaw: string; timestampUtc: string; location: string; fromParty: string; toParty: string;
  sender: string; receiver: string; reference: string; notes: string;
  attachment: File | null; origin: 'SYNTHETIC';
}
