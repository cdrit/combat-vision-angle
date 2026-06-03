const MODULE_ID = "combat-vision-angle";

const OUT_OF_COMBAT_ANGLE = 360;
const IN_COMBAT_ANGLE = 180;

let scheduled = false;
let running = false;

function getDocuments(collection) {
  return collection?.contents ?? Array.from(collection ?? []);
}

function getResponsibleGM() {
  const users = getDocuments(game.users);
  return users
    .filter(user => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

function isResponsibleGM() {
  return game.user?.isGM && getResponsibleGM()?.id === game.user.id;
}

function getCombatSceneId(combat) {
  if (combat.scene?.id) return combat.scene.id;
  if (typeof combat.scene === "string") return combat.scene;
  return null;
}

function getCombatStateByScene() {
  const state = {
    globalCombat: false,
    combatSceneIds: new Set()
  };

  for (const combat of getDocuments(game.combats)) {
    if (!combat.started) continue;

    const sceneId = getCombatSceneId(combat);

    if (sceneId) state.combatSceneIds.add(sceneId);
    else state.globalCombat = true;
  }

  return state;
}

async function applyVisionAngles() {
  if (!game.ready) return;
  if (!isResponsibleGM()) return;

  const { globalCombat, combatSceneIds } = getCombatStateByScene();

  for (const scene of getDocuments(game.scenes)) {
    const desiredAngle = globalCombat || combatSceneIds.has(scene.id)
      ? IN_COMBAT_ANGLE
      : OUT_OF_COMBAT_ANGLE;

    const updates = getDocuments(scene.tokens)
      .filter(token => Number(token.sight?.angle) !== desiredAngle)
      .map(token => ({
        _id: token.id,
        "sight.angle": desiredAngle
      }));

    if (!updates.length) continue;

    await scene.updateEmbeddedDocuments("Token", updates);
  }
}

function scheduleApplyVisionAngles() {
  if (scheduled) return;

  scheduled = true;

  window.setTimeout(async () => {
    scheduled = false;

    if (running) {
      scheduleApplyVisionAngles();
      return;
    }

    running = true;

    try {
      await applyVisionAngles();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to apply token vision angles`, error);
    } finally {
      running = false;
    }
  }, 100);
}

Hooks.once("ready", scheduleApplyVisionAngles);

Hooks.on("createCombat", scheduleApplyVisionAngles);
Hooks.on("updateCombat", scheduleApplyVisionAngles);
Hooks.on("deleteCombat", scheduleApplyVisionAngles);
Hooks.on("combatStart", scheduleApplyVisionAngles);

Hooks.on("createToken", scheduleApplyVisionAngles);

Hooks.on("updateToken", (_token, changed) => {
  if (foundry.utils.hasProperty(changed, "sight.angle")) {
    scheduleApplyVisionAngles();
  }
});

Hooks.on("canvasReady", scheduleApplyVisionAngles);
