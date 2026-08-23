document.addEventListener("DOMContentLoaded", () => {

    // -- Element references --
    const weaponType        = document.getElementById("weaponType");
    const armorType         = document.getElementById("armorType");
    const itemSelect        = document.getElementById("itemSelect");

    const prefixCustom       = document.getElementById("prefixCustom");
    const suffixCustom       = document.getElementById("suffixCustom");
    const prefixSelect      = document.getElementById("prefixSelect");
    const suffixSelect      = document.getElementById("suffixSelect");

    const form              = document.getElementById("generator-form");
    const resultCard        = document.getElementById("resultCard");
    const itemNameEl        = document.getElementById("itemName");
    const rarityLabelEl       = document.getElementById("rarityLabel");
    const itemPropertiesEl  = document.getElementById("itemProperties");

    // -- State --
    // Cache fetched lists so each UI update doesnt require another request
    let cachedWeapons   = null;
    let cachedArmor     = null;
    let cachedAffixes   = null; // full affix list from DB
    let lastLoadedType  = null; // type currently in the item dropdown

    // -- Utility --
    function show(el) { el.classList.remove("hidden"); }
    function hide(el) { el.classList.add("hidden"); }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Weapon, armor, or null
    function getCheckedType() {
        if (weaponType.checked) return "weapon";
        if (armorType.checked)  return "armor";
        return null;
    }

    // -- Data fetching --

    async function fetchItemList(type) {
        // Use from cache if already loaded
        if (type === "weapon" && cachedWeapons) return cachedWeapons;
        if (type === "armor"  && cachedArmor)   return cachedArmor;

        const endpoint = type === "weapon" ? "/api/items/weapons" : "/api/items/armor";

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`Failed to fetch ${type} list`);
        const items = await response.json();

        if (type === "weapon") cachedWeapons = items;
        else                   cachedArmor   = items;

        return items;
    }

    async function fetchAffixes() {
        if (cachedAffixes) return cachedAffixes;

        const response = await fetch("/api/affixes");
        if (!response.ok) throw new Error("Failed to fetch affixes");
        cachedAffixes = await response.json();
        return cachedAffixes;
    }

    async function fetchItemDetail(index) {
        const response = await fetch(`/api/items/detail/${index}`);
        if (!response.ok) throw new Error(`Failed to fetch item detail: ${index}`);
        return await response.json();
    }

    // -- Populate dropdowns --

    async function populateItemDropdown(type) {
        // When no type selected only 'Random' shows
        if (!type) {
            itemSelect.innerHTML = `<option value="random">Random</option>`;
            lastLoadedType = null;
            return;
        }

        // Skip populating if the item type is already loaded 
        if (lastLoadedType === type) return;

        itemSelect.innerHTML = "";
        const loadingOption = document.createElement("option");
        loadingOption.disabled = true;
        loadingOption.textContent = "Loading...";
        itemSelect.appendChild(loadingOption);

        try {
            const items = await fetchItemList(type);

            itemSelect.innerHTML = "";

            const randomOption = document.createElement("option");
            randomOption.value = "random";
            randomOption.textContent = "Random";
            itemSelect.appendChild(randomOption);

            items.forEach(item => {
                const option = document.createElement("option");
                option.value = item.index;
                option.textContent = item.name;
                itemSelect.appendChild(option);
            });

            lastLoadedType = type;

        } catch (err) {
            console.error("Failed to load items:", err);
            itemSelect.innerHTML = "";
            const errorOption = document.createElement("option");
            errorOption.disabled = true;
            errorOption.textContent = "Failed to load items";
            itemSelect.appendChild(errorOption);
        }
    }

    async function populateAffixDropdowns(itemType) {
        // Reset to defaults first
        prefixSelect.innerHTML = `<option value="random">Random</option><option value="none">None</option>`;
        suffixSelect.innerHTML = `<option value="random">Random</option><option value="none">None</option>`;

        try {
            const affixes = await fetchAffixes();

            // Build bundles using the engine so the dropdown matches exactly what
            // the engine will select. There will be one option per logical affix not per DB row
            const bundles = MagicItemEngine.buildAffixBundles(affixes);
            const prefixBundles = MagicItemEngine.filterBundles(bundles, "prefix", itemType);
            const suffixBundles = MagicItemEngine.filterBundles(bundles, "suffix", itemType);

            // Use the id of the bundles first row as the option value.
            // resolveCustomBundle will find the bundle that contains that id.
            prefixBundles.forEach(bundle => {
                const option = document.createElement("option");
                option.value = bundle.rows[0].id;
                option.textContent = bundle.display_name;
                prefixSelect.appendChild(option);
            });

            suffixBundles.forEach(bundle => {
                const option = document.createElement("option");
                option.value = bundle.rows[0].id;
                option.textContent = bundle.display_name;
                suffixSelect.appendChild(option);
            });

        } catch (err) {
            console.error("Failed to load affixes:", err);
        }
    }

    // -- Render result --

    function renderResult(item) {
        // Rarity based on number of affixes
        const rarity = ItemDisplay.getRarity(item);

        // Item name
        itemNameEl.textContent = item.name;
        itemNameEl.className = `item-name ${rarity.className}`;

        const baseTypeName = item.baseItem?.name ? ItemDisplay.normalizeBaseName(item.baseItem.name) : "";
        rarityLabelEl.textContent = baseTypeName ? `${rarity.label} ${baseTypeName}` : rarity.label;
        rarityLabelEl.className = `rarity-label ${rarity.className}`;

        // Clear previous properties
        itemPropertiesEl.innerHTML = "";

        function addProperty(label, value) {
            const li = document.createElement("li");
            li.innerHTML = `<span class="prop-label">${label}</span><span class="prop-value"> ${value}</span>`;
            itemPropertiesEl.appendChild(li);
        }

        // Item type
        //addProperty("Type", item.itemType === "weapon" ? "Weapon" : "Armor");

        // Damage - weapons only
        if (item.damageDisplay) {
            addProperty("Damage", item.damageDisplay);
        }

        // Armor class -armor only
        if (item.itemType === "armor" && item.baseItem.armor_class) {
            const ac = item.baseItem.armor_class;
            let acStr = `${ac.base}`;
            if (ac.dex_bonus) {
                acStr += ac.max_bonus ? ` + DEX (max ${ac.max_bonus})` : " + DEX";
            }
            addProperty("Armor Class", acStr);
        }

        // Add these later once display is cleaned up

        // Base weapon properties
        //if (item.properties && item.properties.length > 0) {
        //    addProperty("Properties", item.properties.join(", "));
        //}

        // Stealth disadvantage
        //if (item.itemType === "armor" && item.baseItem.stealth_disadvantage) {
        //    addProperty("Special", "Disadvantage on Stealth checks");
        //}

        // Affix effect descriptions
        item.descriptions.forEach(desc => {
            const li = document.createElement("li");
            li.className = "prop-description";
            li.textContent = desc;
            itemPropertiesEl.appendChild(li);
        });

        show(resultCard);
        triggerRevealAnimation();
        resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function triggerRevealAnimation() {
        resultCard.classList.remove("reveal-active");
        void resultCard.offsetWidth;
        resultCard.classList.add("reveal-active");
    }

    // -- UI state management --

    function updateUI() {
        const type = getCheckedType();

        // Use 'Random' if neither is checked
        populateItemDropdown(type);

        // Default to weapon pool if no item type is selected
        // Maybe I fix this later to show all and then if a weapon affix is selected
        // armor affixes are removed from the other drop down options and vice versa
        populateAffixDropdowns(type || "weapon");

        // Prefix/suffix dropdown
        if (prefixCustom.checked) show(prefixSelect); else hide(prefixSelect);
        if (suffixCustom.checked) show(suffixSelect); else hide(suffixSelect);
    }

    // Weapon/Armor are mutually exclusive
    weaponType.addEventListener("change", () => {
        if (weaponType.checked) armorType.checked = false;
        lastLoadedType = null;
        updateUI();
    });

    armorType.addEventListener("change", () => {
        if (armorType.checked) weaponType.checked = false;
        lastLoadedType = null;
        updateUI();
    });

    prefixCustom.addEventListener("change", updateUI);
    suffixCustom.addEventListener("change", updateUI);

    // -- Form submission --

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector(".generate-btn");
        submitBtn.disabled = true;
        submitBtn.textContent = "Generating...";

        try {
            const affixes = await fetchAffixes();

            // Resolve item type
            const checkedType = getCheckedType();
            const resolvedType = checkedType || (Math.random() < 0.5 ? "weapon" : "armor");

            // Resolve which base item to use
            let selectedIndex = (checkedType && itemSelect.value !== "random")
                ? itemSelect.value
                : null;

            if (!selectedIndex) {
                const list = await fetchItemList(resolvedType);
                selectedIndex = pickRandom(list).index;
            }

            // Fetch full item data
            const baseItem = await fetchItemDetail(selectedIndex);

            // Each slot is independently forced or unforced
            // Unforced will let the engine roll its own 50/50 for whether it appears
            const generatedItem = MagicItemEngine.generateMagicItem({
                baseItem,
                itemType: resolvedType,
                affixes,
                prefixForced: prefixCustom.checked,
                prefixValue:  prefixSelect.value,
                suffixForced: suffixCustom.checked,
                suffixValue:  suffixSelect.value,
            });

            // Reset save button for the new item
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Item";
            }

            lastGeneratedItem = generatedItem; 
            renderResult(generatedItem);

        } catch (err) {
            console.error("Generation failed:", err);
            alert("Something went wrong generating the item. Check the console for details.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Generate Item";
        }
    });

    // -- Save item --

    const saveBtn = document.getElementById("saveItemBtn");
    let lastGeneratedItem = null;

    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            if (!lastGeneratedItem) return;

            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";

            try {
                const response = await fetch("/api/items/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item: lastGeneratedItem })
                });

                const data = await response.json();

                if (response.ok) {
                    saveBtn.textContent = "Saved!";
                } else {
                    saveBtn.textContent = "Save Failed";
                    saveBtn.disabled = false;
                    console.error("Save error:", data.error);
                }
            } catch (err) {
                saveBtn.textContent = "Save Failed";
                saveBtn.disabled = false;
                console.error("Save request failed:", err);
            }
        });
    }

    // -- Initial state --
    updateUI();
});