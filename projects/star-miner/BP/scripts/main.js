import { world } from '@minecraft/server';

// Entry point for Star Miner. Scripts start before the world is loaded (early execution):
// subscribe to events here, but touch world state only inside events or worldLoad.
world.afterEvents.worldLoad.subscribe(() => {
  console.warn('[star_miner] Star Miner loaded');
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) player.sendMessage('§aStar Miner§r is running!');
});
