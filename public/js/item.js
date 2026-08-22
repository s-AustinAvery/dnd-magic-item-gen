document.addEventListener("DOMContentLoaded", () => {

    const saveBtn      = document.getElementById("saveSharedItemBtn");
    const saveFeedback = document.getElementById("saveFeedback");

    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";

            try {
                const response = await fetch("/api/items/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item: sharedItem })
                });

                const data = await response.json();

                if (response.ok) {
                    saveBtn.textContent = "Saved!";
                    saveFeedback.textContent = "Item added to your collection.";
                } else {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save to My Collection";
                    saveFeedback.textContent = data.error || "Something went wrong.";
                }

                saveFeedback.classList.remove("hidden");

            } catch (err) {
                console.error("Save failed:", err);
                saveBtn.disabled = false;
                saveBtn.textContent = "Save to My Collection";
                saveFeedback.textContent = "Something went wrong.";
                saveFeedback.classList.remove("hidden");
            }
        });
    }

    // Owner controls

    const viewActions    = document.getElementById("viewActions");
    const editActions     = document.getElementById("editActions");
    const editBtn        = document.getElementById("editItemBtn");
    const saveEditBtn    = document.getElementById("saveItemEditBtn");
    const cancelEditBtn  = document.getElementById("cancelItemEditBtn");
    const nameDisplay      = document.getElementById("itemNameDisplay");
    const nameInput        = document.getElementById("itemNameInput");
    const descView         = document.getElementById("itemDescriptionView");
    const descInput        = document.getElementById("itemDescriptionInput");
    const editFeedback     = document.getElementById("editFeedback");

    if (!editBtn) return; // Dont wire unless they own the item

    let originalName        = nameInput.value;
    let originalDescription = descInput.value;

    function enterEditMode() {
        nameDisplay.classList.add("hidden");
        nameInput.classList.remove("hidden");
        descView.classList.add("hidden");
        descInput.classList.remove("hidden");
        viewActions.classList.add("hidden");
        editActions.classList.remove("hidden");
        editFeedback.classList.add("hidden");
    }

    function exitEditMode() {
        nameDisplay.classList.remove("hidden");
        nameInput.classList.add("hidden");
        descInput.classList.add("hidden");
        viewActions.classList.remove("hidden");
        editActions.classList.add("hidden");
    }

    editBtn.addEventListener("click", enterEditMode);

    cancelEditBtn.addEventListener("click", () => {
        nameInput.value = originalName;
        descInput.value = originalDescription;
        descView.classList.toggle("hidden", !originalDescription);
        exitEditMode();
    });

    saveEditBtn.addEventListener("click", async () => {
        const newName = nameInput.value.trim();
        const newDescription = descInput.value.trim();

        if (!newName) {
            editFeedback.textContent = "Name cannot be empty.";
            editFeedback.classList.remove("hidden");
            return;
        }

        saveEditBtn.disabled = true;
        saveEditBtn.textContent = "Saving...";

        try {
            const response = await fetch(`/api/items/collection/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName, description: newDescription })
            });

            const data = await response.json();

            if (!response.ok) {
                editFeedback.textContent = data.error || "Failed to save changes.";
                editFeedback.classList.remove("hidden");
                return;
            }

            nameDisplay.textContent = newName;
            descView.textContent = newDescription;
            descView.classList.toggle("hidden", !newDescription);

            originalName = newName;
            originalDescription = newDescription;

            editFeedback.classList.add("hidden");
            exitEditMode();

        } catch (err) {
            console.error("Edit save failed:", err);
            editFeedback.textContent = "Something went wrong.";
            editFeedback.classList.remove("hidden");
        } finally {
            saveEditBtn.disabled = false;
            saveEditBtn.textContent = "Save";
        }
    });

    const shareBtn        = document.getElementById("shareItemBtn");
    const shareModal      = document.getElementById("shareModal");
    const shareLinkInput  = document.getElementById("shareLinkInput");
    const closeShareBtn   = document.getElementById("closeShareBtn");

    if (shareBtn) {
        shareBtn.addEventListener("click", () => {
            shareModal.classList.remove("hidden");
        });

        closeShareBtn.addEventListener("click", () => {
            shareModal.classList.add("hidden");
        });

        shareModal.addEventListener("click", (e) => {
            if (e.target === shareModal) shareModal.classList.add("hidden");
        });
    }

    // -- Delete modal --

    const deleteBtn        = document.getElementById("deleteItemBtn");
    const deleteModal      = document.getElementById("deleteModal");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const cancelDeleteBtn  = document.getElementById("cancelDeleteBtn");

    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            deleteModal.classList.remove("hidden");
        });

        cancelDeleteBtn.addEventListener("click", () => {
            deleteModal.classList.add("hidden");
        });

        deleteModal.addEventListener("click", (e) => {
            if (e.target === deleteModal) deleteModal.classList.add("hidden");
        });

        confirmDeleteBtn.addEventListener("click", async () => {
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.textContent = "Deleting...";

            try {
                const response = await fetch(`/api/items/collection/${itemId}`, {
                    method: "DELETE"
                });

                if (!response.ok) throw new Error("Delete failed");

                // Return to collection after deleting
                window.location.href = "/collection";

            } catch (err) {
                console.error("Delete failed:", err);
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.textContent = "Delete";
                alert("Something went wrong deleting this item. Please try again.");
            }
        });
    }
});