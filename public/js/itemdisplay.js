// -- base name normalization --

/**
 * Normalize the name of items that use a
 * reversed "Category, Modifier" format
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeBaseName(name) {
  const match = name.match(/^(.+),\s*(.+)$/);
  if (!match) return name;
  return `${match[2]} ${match[1]}`;
}

// -- rarity --

// Affix count dictates rarity. currently only 
// rarirties 1-2 are implmented
const RARITY_TIERS = [
  { max: 0, className: "rarity-common",   label: "Common" },
  { max: 1, className: "rarity-uncommon", label: "Uncommon" },
  { max: 2, className: "rarity-rare",     label: "Rare" },
  { max: 4, className: "rarity-epic",     label: "Epic" },
];

/**
 * Determine rarity from the items number of affixes
 * @param {{ prefix?: Object|null, suffix?: Object|null }} item
 * @returns {{ className: string, label: string }}
 */
function getRarity(item) {
  const affixCount = [item?.prefix, item?.suffix].filter(Boolean).length;
  return RARITY_TIERS.find(tier => affixCount <= tier.max) ?? RARITY_TIERS[RARITY_TIERS.length - 1];
}

// -- exports --

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeBaseName,
    getRarity,
    RARITY_TIERS,
  };
} else {
  window.ItemDisplay = {
    normalizeBaseName,
    getRarity,
    RARITY_TIERS,
  };
}