// -- die tracks --

const SINGLE_DIE_TRACK = [
  { count: 1, die: 4 },
  { count: 1, die: 6 },
  { count: 1, die: 8 },
  { count: 1, die: 10 },
  { count: 1, die: 12 },
  { count: 2, die: 8 },
  { count: 2, die: 10 },
  { count: 2, die: 12 },
];

const MULTI_DIE_TRACK = [
  { count: 2, die: 6 },
  { count: 2, die: 8 },
  { count: 2, die: 10 },
  { count: 2, die: 12 },
];

// -- helper functions --

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseDamage(damageStr) {
  // Pull appart the '1d6 Slashing' format and stores each piece in an array ["1d6 Slashing", "1", "6", "Slashing"]
  const match = damageStr.match(/^(\d+)d(\d+)\s+(.+)$/i); //using /i case insensitive flag

  if (!match) {
    throw new Error(`Cannot parse damage string: "${damageStr}"`);
  }

  return {
    count: parseInt(match[1], 10), // Return as int (base 10)
    die:   parseInt(match[2], 10), // Return as int (base 10)
    type:  match[3].toLowerCase(), // Return as lowercase
  };
}

function formatDie(d) {
  // Combine object variables 'count' (1), 'die' (6), and 'type' (slashing) into string format ('1d6 slashing')
  return `${d.count}d${d.die} ${d.type}`;
}

function advanceDie(current, steps) {
  // Flag for which track to use
  const isSingle = current.count === 1; //single track weapons begin with 1, multi track weapons begin with 2
  // If true, single, else multi
  const track = isSingle ? SINGLE_DIE_TRACK : MULTI_DIE_TRACK; //later can be altered for 3+ damage die

  // Iterate over the selected track array
  let idx = track.findIndex(
    // Find and store the index where count is equal to current count and die is equal to current die
    (e) => e.count === current.count && e.die === current.die
  );

  // If not found
  if (idx === -1) {
    // Just return an object with the current values
    return { ...current };
  }

  // Return object with values of index idx + steps of selected array (capped to prevent out of bounds)
  return { ...track[Math.min(idx + steps, track.length - 1)] };
}

// -- affix bundling --

/**
 * Groups DB rows into affix bundles.
 *
 * A 'bundle' is one full prefix or suffix as would be applied to
 * the weapon. Rows that share the same display_name AND affix_slot belong to the
 * same bundle as multiple pieces of one full affix
 *
 * @param {Array<Object>} affixes  Raw rows from the DB
 * @returns {Array<AffixBundle>}
 *
 * @typedef {{ display_name: string, affix_slot: string, applies_to: string, rows: Array<Object> }} AffixBundle
 */
function buildAffixBundles(affixes) {

  const map = new Map();

  for (const row of affixes) {
    // Combine the affix slot and name to use as a key so "Burning prefix" and "Burning suffix" stay separate
    const key = `${row.affix_slot}::${row.display_name}`;

    if (!map.has(key)) {
      // If key not found add key value pair to the map storing the consistent values for the bundle
      map.set(key, {
        display_name: row.display_name,
        affix_slot:   row.affix_slot,
        applies_to:   row.applies_to,
        rows:         [], // Array that will store each row that is grouped in this bundle
      });
    }

    // Add the current row to the rows array where the key matches
    map.get(key).rows.push(row);
  }

  // Return all the stored bundle objects in the map as an array
  return Array.from(map.values());
}

/**
 * Filter bundles by slot and item type.
 *
 * Applies_to is taken from the bundle level field
 * All rows in a bundle share the same applies_to value
 *
 * @param {Array<AffixBundle>} bundles
 * @param {"prefix"|"suffix"} slot
 * @param {"weapon"|"armor"} itemType
 * @returns {Array<AffixBundle>}
 */
function filterBundles(bundles, slot, itemType) {
  // Iterates through the array, returns only elements that match the conditions
  return bundles.filter(
    (b) =>
      b.affix_slot === slot && // Filter out bundles by passed in slot
      (b.applies_to === "both" || b.applies_to === itemType) // Filter out bundles by passed in type (both is allowed)
  );
}

// -- affix resolution --

/**
 * Resolve which prefix bundle and suffix bundle to apply.
 *
 * Returns bundles which are arrays of rows, not individual rows.
 * Either value may be null if no affix is assigned to that slot.
 *
 * @param {Array<Object>} affixes      Raw DB rows
 * @param {"weapon"|"armor"} itemType
 * @param {"random"|"prefix"|"suffix"|"both"|"custom"} affixMode
 * @param {{ prefixId?: string|number, suffixId?: string|number }} [customOptions]
 * @returns {{ prefix: AffixBundle|null, suffix: AffixBundle|null }}
 */
function resolveAffixes(affixes, itemType, affixMode, customOptions = {}) {
  const bundles       = buildAffixBundles(affixes); // All db rows as affix bundles (all rows for 'Burning' are grouped)
  const prefixBundles = filterBundles(bundles, "prefix", itemType); // All prefix bundles
  const suffixBundles = filterBundles(bundles, "suffix", itemType); // All suffix bundles

  // Custom: caller specifies each slot
  if (affixMode === "custom") {
    // Get the ids for the selected options
    const { prefixId, suffixId } = customOptions;
    return {
      // Get specific affix by id, if id is none return null, if id is random select randomly from pool
      prefix: resolveCustomBundle(prefixId, prefixBundles),
      suffix: resolveCustomBundle(suffixId, suffixBundles),
    };
  }

  // Random: 1/3 prefix only, 1/3 suffix only, 1/3 both
  const roll = Math.ceil(Math.random() * 3);
  const wantPrefix = roll === 1 || roll === 3;
  const wantSuffix = roll === 2 || roll === 3;

  return {
    // Return random from prefix pools
    prefix: wantPrefix ? (pickRandom(prefixBundles) ?? null) : null,
    suffix: wantSuffix ? (pickRandom(suffixBundles) ?? null) : null,
  };
}

/**
 * Resolve a custom slot selection to a bundle.
 *
 * The dropdown shows one option per bundle, using the id of the bundles
 * first row as the option value. Find whichever bundle contains that id.
 *
 * @param {string|number|undefined} id   Value from the select element
 * @param {Array<AffixBundle>} pool      Filtered bundles for this slot/type
 * @returns {AffixBundle|null}
 */
function resolveCustomBundle(id, pool) {
  if (!id || id === "none") return null;
  // Select from pool of affixes
  if (id === "random")      return pickRandom(pool) ?? null;

  // Find and return the bundle whose row list contains this id
  return pool.find((b) => b.rows.some((r) => String(r.id) === String(id))) ?? null;
}

// -- name builder --

/**
 * Build the display name for the generated item.
 *
 * @param {string} baseName
 * @param {AffixBundle|null} prefix
 * @param {AffixBundle|null} suffix
 * @returns {string}
 */
function buildItemName(baseName, prefix, suffix) {
  let name = baseName;
  //add prefix, base becomes lower case
  if (prefix) name = `${prefix.display_name} ${name.toLowerCase()}`;
  //add on 'of' the suffix
  if (suffix) name = `${name} of ${suffix.display_name}`;
  //fully assembled name
  return name;
}

// -- effect processor --

/**
 * Apply prefix and suffix bundles to a base item.
 *
 * All effect rows from both bundles are processed together, so stacking
 * multiple affixes with the same effect still works correctly,
 * and multi row bundles like 'Sanctified' apply all their effects.
 *
 * @param {Object} baseItem
 * @param {AffixBundle|null} prefix
 * @param {AffixBundle|null} suffix
 * @param {"weapon"|"armor"} itemType
 * @returns {Object}
 */
function applyAffixes(baseItem, prefix, suffix, itemType) {
  // Combine and flatten all effect rows from both bundles into an array
  const effectRows = [
    ...(prefix?.rows ?? []), // Check if null otherwise add rows
    ...(suffix?.rows ?? []), // Check if null otherwise add rows
  ];

  // Item properties
  let damageBase  = null;  // { count, die, type }
  let bonusDamage = [];    // [{ dice, type }]
  let statMap     = {};    // { [effect_target]: number }
  let utilities   = [];    // [string]
  let dieSteps    = 0;

  // Build the base damage for weapons
  if (itemType === "weapon" && baseItem.damage?.damage_dice) {
    // Format values into damage array format
    damageBase = parseDamage(
      `${baseItem.damage.damage_dice} ${baseItem.damage.damage_type?.name ?? "Unknown"}`
    );
  }

  // Process every row by effect_category
  for (const row of effectRows) {
    switch (row.effect_category) {
      case "stat": {
        // Collected into the map
        statMap[row.effect_target] = (statMap[row.effect_target] || 0) + Number(row.effect_value);
        break;
      }
      case "utility": {
        // Just added to the discription
        utilities.push(row.description);
        break;
      }
      case "weapon_die": {
        // Add up the die upgrade count
        dieSteps += Number(row.effect_value) || 1;
        break;
      }
      case "damage": {
        if (row.damage_mode === "replace" && damageBase) {
          // If the mode is replace, swap out to new type
          damageBase.type = row.effect_target;
        } else if (row.damage_mode === "add") {
          // Otherwise add damage values to bonusDamage array
          bonusDamage.push({ dice: row.effect_value, type: row.effect_target });
        }
        break;
      }
    }
  }

  // Alter weapon die
  if (dieSteps > 0 && damageBase) {
    // Pass in the base damage and number of steps
    const advanced   = advanceDie({ count: damageBase.count, die: damageBase.die }, dieSteps);
    // Replace count with new value
    damageBase.count = advanced.count;
    // Replace die size with new value
    damageBase.die   = advanced.die;
  }

  // Build description/display strings
  let damageDisplay = null;

  if (damageBase) {
    // Convert damage info into string
    damageDisplay = formatDie(damageBase);

    for (const bd of bonusDamage) {
      // Add each element in the array to the string ('+ 1d6 fire')
      damageDisplay += ` + ${bd.dice} ${bd.type}`;
    }
  }

  // Convert statMap into description array
  const statDescriptions = Object.entries(statMap).map(
    // Take key and value from map and pass into stat description builder
    ([target, value]) => buildStatDescription(target, value, effectRows) 
  );

  // Combine arrays
  const descriptions = [
    ...statDescriptions, // Built from 'stat' effect_category
    ...utilities, // Built from 'utility' effect_category
    // Remove duplicate descriptions from 'damage' effect_category rows
    ...dedupeDescriptions( //b Bilt from 'damage' effect_category
      effectRows.filter((r) => r.effect_category === "damage" && r.description)
    ),
  ];

  // Return the items compiled results as an object
  return {
    name: buildItemName(baseItem.name, prefix, suffix),
    baseItem,
    itemType,
    prefix,
    suffix,
    damageDisplay,
    properties:   baseItem.properties?.map((p) => p.name) ?? [],
    descriptions,
    statMap,
    bonusDamage,
  };
}

/**
 * Prevent the same description string appearing twice when a bundle has
 * multiple rows that share identical description text.
 *
 * @param {Array<Object>} rows
 * @returns {Array<string>}
 */
function dedupeDescriptions(rows) {
  const seen = new Set(); // Store unique discriptions
  const result = []; // Array descriptions will be added to

  for (const row of rows) {
    // If the description hasnt been added to the seen set
    if (!seen.has(row.description)) {
      // Add it to the seen set
      seen.add(row.description);
      // Add it to the descriptions array
      result.push(row.description);
    }
  }
  return result;
}

/**
 * Build a readable stat description with the stacked total value
 *
 * @param {string} target
 * @param {number} totalValue
 * @param {Array<Object>} effectRows
 * @returns {string}
 */
function buildStatDescription(target, totalValue, effectRows) {
  // Search for the row that matches these conditions and store its description
  const template = effectRows.find(
    // Should be a 'stat' with a matching effect_target
    (r) => r.effect_target === target && r.effect_category === "stat"
  )?.description;

  // If a description wasnt found just return values back 'strength: 1'
  if (!template) return `${target}: ${totalValue}`;

  // Return the description after replacing number(s) with the total value collected
  return template.replace(/\d+/, String(totalValue));
}

// -- public api --

/**
 * Generate a magic item.
 *
 * @param {Object} params
 * @param {Object}   params.baseItem
 * @param {string}   params.itemType      'weapon' | 'armor'
 * @param {Array}    params.affixes       Raw DB rows
 * @param {string}   params.affixMode     'random'|'custom'
 * @param {string}   [params.prefixId]    Custom mode: a row id, 'random', or 'none'
 * @param {string}   [params.suffixId]    Custom mode: a row id, 'random', or 'none'
 * @returns {Object}
 */
function generateMagicItem({ baseItem, itemType, affixes, affixMode, prefixId, suffixId }) {
  // Decide on which prefix and/or affix to use
  const { prefix, suffix } = resolveAffixes(
    affixes, // DB rows
    itemType, // Limit by weapon/armor
    affixMode, // Random or custom
    { prefixId, suffixId } // Specified row, random, or none
  );

  // Return object containing compiled results
  return applyAffixes(baseItem, prefix, suffix, itemType);
}

// -- exports --

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateMagicItem,
    buildAffixBundles,
    filterBundles,
    resolveAffixes,
    applyAffixes,
    buildItemName,
    advanceDie,
    parseDamage,
    formatDie,
    SINGLE_DIE_TRACK,
    MULTI_DIE_TRACK,
  };
} else {
  window.MagicItemEngine = {
    generateMagicItem,
    buildAffixBundles,
    filterBundles,
    resolveAffixes,
    applyAffixes,
    buildItemName,
    advanceDie,
    parseDamage,
    formatDie,
    SINGLE_DIE_TRACK,
    MULTI_DIE_TRACK,
  };
}