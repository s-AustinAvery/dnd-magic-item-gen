document.addEventListener("DOMContentLoaded", async () => {

    const collectionList  = document.getElementById("collectionList");

    // -- Render a single item card --

    function createItemCard(item) {
        const card = document.createElement("div");
        card.className = "card saved-item-card clickable-card";
        card.dataset.id = item.id;

        // Name
        const rarity = ItemDisplay.getRarity(item);

        const name = document.createElement("div");
        name.className = `item-name ${rarity.className}`;
        name.textContent = item.name;
        card.appendChild(name);

        // Properties list
        const propList = document.createElement("ul");
        propList.className = "item-properties";

        function addProperty(label, value) {
            const li = document.createElement("li");
            li.innerHTML = `<span class="prop-label">${label}</span><span class="prop-value"> ${value}</span>`;
            propList.appendChild(li);
        }

        // Damage - weapons
        if (item.damageDisplay) {
            addProperty("Damage", item.damageDisplay);
        }

        // Armor class - armor
        if (item.itemType === "armor" && item.baseItem?.armor_class) {
            const ac = item.baseItem.armor_class;
            let acStr = `${ac.base}`;
            if (ac.dex_bonus) {
                acStr += ac.max_bonus ? ` + DEX (max ${ac.max_bonus})` : " + DEX";
            }
            addProperty("Armor Class", acStr);
        }

        // Affix descriptions
        if (item.descriptions?.length) {
            item.descriptions.forEach(desc => {
                const li = document.createElement("li");
                li.className = "prop-description";
                li.textContent = desc;
                propList.appendChild(li);
            });
        }

        card.appendChild(propList);

        // Saved date
        const savedAt = document.createElement("p");
        savedAt.className = "saved-date";
        // fix this later
        //savedAt.textContent = `Saved ${new Date(item.saved_at).toLocaleDateString()}`;
        card.appendChild(savedAt);

        // Card is now link to the item page
        card.addEventListener("click", () => goToItemPage(item));

        return card;
    }

    async function goToItemPage(item) {
        if (item.share_token) {
            window.location.href = `/item/${item.share_token}`;
            return;
        }

        try {
            const response = await fetch(`/api/items/collection/${item.id}/share`, {
                method: "POST"
            });

            if (!response.ok) throw new Error("Failed to get item link");

            const data = await response.json();
            window.location.href = `/item/${data.token}`;

        } catch (err) {
            console.error("Failed to open item:", err);
            alert("Something went wrong opening this item. Please try again.");
        }
    }

    // -- Load collection --

    async function loadCollection() {
        try {
            const response = await fetch("/api/items/collection");
            if (!response.ok) throw new Error("Failed to fetch collection");

            const items = await response.json();

            collectionList.innerHTML = "";

            if (items.length === 0) {
                collectionList.innerHTML = `<p class="muted">You haven't saved any items yet. <a href="/">Generate one!</a></p>`;
                return;
            }

            items.forEach(item => {
                collectionList.appendChild(createItemCard(item));
            });

        } catch (err) {
            console.error("Failed to load collection:", err);
            collectionList.innerHTML = `<p class="muted">Failed to load your collection. Please try again.</p>`;
        }
    }

    // -- Init --
    loadCollection();
});