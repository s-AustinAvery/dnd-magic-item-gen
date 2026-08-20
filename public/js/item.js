document.addEventListener("DOMContentLoaded", () => {

    const saveBtn      = document.getElementById("saveSharedItemBtn");
    const saveFeedback = document.getElementById("saveFeedback");

    if (!saveBtn) return; // Nothing to wire up for guest

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
});