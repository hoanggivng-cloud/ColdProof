export interface ScenarioLeg {
  legId: string;
  expectedObservationCount: number;
}

declare const core: {
  LEG_DEFINITIONS: ScenarioLeg[];
  assignLeg(timestamp: string): ScenarioLeg | undefined;
  parseCsv(text: string): Array<Record<string, string>>;
  validateArtifactContents(artifacts: Map<string, string>): void;
};

export = core;
