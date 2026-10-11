export const FIRST_NAMES = [
  'Mira', 'Tobin', 'Ada', 'Bram', 'Cora', 'Dale', 'Edda', 'Finn', 'Greta', 'Hal', 'Ilse', 'Jory', 'Kit', 'Lena',
  'Moss', 'Nell', 'Otto', 'Pip', 'Quill', 'Rosa', 'Sven', 'Tilda', 'Ulf', 'Vera', 'Wren', 'Yara', 'Zed', 'Alder',
  'Birch', 'Clover', 'Dov', 'Elm', 'Fern', 'Gil', 'Hazel', 'Ivo', 'Juniper', 'Kai', 'Linden', 'Maple', 'Nico',
  'Oona', 'Perry', 'Rowan', 'Sage', 'Teo', 'Una', 'Willow', 'Ash', 'Bea',
];

export const COLONY_NAMES = [
  'Oakridge', 'Pinehollow', 'Stonebrook', 'Fernwick', 'Ashford', 'Millbrook', 'Cobblewater', 'Birchmoor',
  'Mossgate', 'Larkspur', 'Thornfield', 'Willowmere',
];

/** Island themes. Prestige moves the colony to a new one. */
export const BIOMES = [
  { id: 'pine_forest', name: 'Pine Forest', grass: 'grass_block', log: 'spruce_log', leaves: 'spruce_leaves', yield: { wood: 1.1 } },
  { id: 'birch_woods', name: 'Birch Woods', grass: 'grass_block', log: 'birch_log', leaves: 'birch_leaves', yield: { fish: 1.1 } },
  { id: 'snowy_peaks', name: 'Snowy Peaks', grass: 'snow', log: 'spruce_log', leaves: 'spruce_leaves', yield: { stone: 1.15 } },
  { id: 'dry_mesa', name: 'Dry Mesa', grass: 'red_sand', log: 'acacia_log', leaves: 'acacia_leaves', yield: { stone: 1.1 } },
] as const;

export type BiomeDef = (typeof BIOMES)[number];

export function biome(id: string): BiomeDef {
  return BIOMES.find((b) => b.id === id) ?? BIOMES[0];
}
