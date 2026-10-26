// One place for the Minecraft Bedrock versions new projects target.
// Stable script module versions stay supported by newer game releases, so bump these
// only when you want newer APIs (and update the agents' knowledge in knowledge.js too).
export const BEDROCK = {
  minEngineVersion: [1, 21, 90],
  manifestFormatVersion: 2,
  scriptModules: {
    '@minecraft/server': '2.0.0',
    '@minecraft/server-ui': '2.0.0',
  },
  formatVersions: {
    item: '1.21.60',
    block: '1.21.60',
    entity: '1.21.0',
    recipe: '1.21.0',
    clientEntity: '1.10.0',
    geometry: '1.12.0',
    renderController: '1.8.0',
    animationController: '1.10.0',
    blocksJson: [1, 1, 0],
  },
};

export const STUDIO_VERSION = '0.1.0';
