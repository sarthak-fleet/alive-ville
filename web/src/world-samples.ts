import abyssalSource from "../../fixtures/worlds/abyssal-source.json" with { type: "json" };
import conservatorySource from "../../fixtures/worlds/conservatory-source.json" with { type: "json" };
import noirSource from "../../fixtures/worlds/noir-source.json" with { type: "json" };
import skyfrontSource from "../../fixtures/worlds/skyfront-source.json" with { type: "json" };

export interface WorldSample {
  id: string;
  label: string;
  summary: string;
  source: unknown;
}

export const WORLD_SAMPLES: WorldSample[] = [
  {
    id: "skyfront",
    label: "Skyfront",
    summary: "Floating courier harbor",
    source: skyfrontSource,
  },
  {
    id: "conservatory",
    label: "Clockwork",
    summary: "Mechanical garden mystery",
    source: conservatorySource,
  },
  {
    id: "abyssal",
    label: "Abyssal",
    summary: "Undersea salvage route",
    source: abyssalSource,
  },
  {
    id: "noir",
    label: "Neon Noir",
    summary: "Rain market evidence case",
    source: noirSource,
  },
];
