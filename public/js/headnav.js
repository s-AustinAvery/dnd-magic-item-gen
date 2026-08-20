document.addEventListener("DOMContentLoaded", () => {
// -- User dropdown --
    const dropdownToggle = document.getElementById("dropdownToggle");
    const dropdownMenu   = document.getElementById("dropdownMenu");

    if (dropdownToggle && dropdownMenu) {
        // Toggle on username click
        dropdownToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle("hidden");
        });

        // Close when clicking anywhere else
        document.addEventListener("click", () => {
            dropdownMenu.classList.add("hidden");
        });
    }
});