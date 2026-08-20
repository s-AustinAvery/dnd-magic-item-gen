document.addEventListener("DOMContentLoaded", async () => {

    const collectionList  = document.getElementById("collectionList");
    const deleteModal     = document.getElementById("deleteModal");
    const deleteItemName  = document.getElementById("deleteItemName");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const cancelDeleteBtn  = document.getElementById("cancelDeleteBtn");

    let pendingDeleteId   = null;

    // -- Render a single item card --

    function createItemCard(item) {
        const card = document.createElement("div");
        card.className = "card saved-item-card";
        card.dataset.id = item.id;

        // Name
        const name = document.createElement("div");
        name.className = "item-name";
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

        // Card actions
        const actions = document.createElement("div");
        actions.className = "card-actions";

        const shareBtn = document.createElement("button");
        shareBtn.className = "btn-secondary";
        shareBtn.textContent = "Share";
        shareBtn.addEventListener("click", () => openShareModal(item.id));

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => openDeleteModal(item.id, item.name));

        actions.appendChild(shareBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(actions);

        return card;
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

    // -- Share modal --

    const shareModal    = document.getElementById("shareModal");
    const shareLinkInput = document.getElementById("shareLinkInput");
    const closeShareBtn  = document.getElementById("closeShareBtn");

    async function openShareModal(id) {
        shareLinkInput.value = "Generating link...";
        shareModal.classList.remove("hidden");

        try {
            const response = await fetch(`/api/items/collection/${id}/share`, {
                method: "POST"
            });

            if (!response.ok) throw new Error("Failed to get share token");

            const data = await response.json();
            shareLinkInput.value = `${window.location.origin}/item/${data.token}`;

        } catch (err) {
            console.error("Share failed:", err);
            shareLinkInput.value = "Failed to generate link.";
        }
    }

    closeShareBtn.addEventListener("click", () => {
        shareModal.classList.add("hidden");
    });

    shareModal.addEventListener("click", (e) => {
        if (e.target === shareModal) shareModal.classList.add("hidden");
    });

    
    // -- Delete modal --

    function openDeleteModal(id, name) {
        pendingDeleteId = id;
        deleteItemName.textContent = name;
        deleteModal.classList.remove("hidden");
    }

    function closeDeleteModal() {
        pendingDeleteId = null;
        deleteModal.classList.add("hidden");
    }

    cancelDeleteBtn.addEventListener("click", closeDeleteModal);

    // Close modal if overlay is clicked
    deleteModal.addEventListener("click", (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    confirmDeleteBtn.addEventListener("click", async () => {
        if (!pendingDeleteId) return;

        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = "Deleting...";

        try {
            const response = await fetch(`/api/items/collection/${pendingDeleteId}`, {
                method: "DELETE"
            });

            if (!response.ok) throw new Error("Delete failed");

            // Remove card without reloading the page
            const card = collectionList.querySelector(`[data-id="${pendingDeleteId}"]`);
            if (card) card.remove();

            // Show empty state if no cards remain
            if (collectionList.children.length === 0) {
                collectionList.innerHTML = `<p class="muted">You haven't saved any items yet. <a href="/">Generate one!</a></p>`;
            }

            closeDeleteModal();

        } catch (err) {
            console.error("Delete failed:", err);
            confirmDeleteBtn.textContent = "Failed — try again";
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = "Delete";
        }
    });

    // -- Init --
    loadCollection();
});