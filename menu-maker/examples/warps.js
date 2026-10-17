import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack.typeId === "minecraft:clock") mainMenu(ev.source);
});

function mainMenu(player) {
  const form = new ActionFormData();
  form.title('§6Warps');
  form.body(`Hi ${player.name}, pick a warp`);
  form.button("Spawn", "textures/ui/world_glyph");
  form.button("Arena");
  form.button("Give money");
  form.show(player).then((r) => {
    if (r.canceled) return;
    if (r.selection === 0) player.runCommandAsync("tp @s 0 64 0");
    else if (r.selection === 1) { player.runCommandAsync('/tp @s 100 64 100'); player.runCommandAsync("say I joined the arena"); }
    else if (r.selection === 2) moneyForm(player);
  });
}

const moneyForm = (player) => {
  new ModalFormData()
    .title("Give money")
    .textField("Player", "name")
    .slider("Amount", 1, 1000, 1, 100)
    .toggle("Anonymous", false)
    .dropdown("Currency", ["coins", "gems"], 0)
    .show(player).then(({ canceled, formValues }) => {
      if (canceled) return;
      const [target, amount, anon, cur] = formValues;
      player.runCommandAsync(`scoreboard players add "${target}" money ${amount}`);
      confirm(player);
    });
};

async function confirm(player) {
  const r = await new MessageFormData().title("Done").body("Money sent!").button1("Menu").button2("Close").show(player);
  if (r.selection === 0) mainMenu(player);
}
