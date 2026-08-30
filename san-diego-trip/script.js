(() => {
  const storageKey = "san-diego-trip-checklist";
  const checklist = [...document.querySelectorAll("[data-checklist-item]")];
  const resetButton = document.querySelector("#reset-checklist");
  const status = document.querySelector("#checklist-status");

  const updateStatus = () => {
    const complete = checklist.filter((item) => item.checked).length;
    status.textContent = complete === 0
      ? "Your checked items are saved on this device."
      : `${complete} of ${checklist.length} checklist items complete. Your progress is saved on this device.`;
  };

  const saveChecklist = () => {
    const savedItems = Object.fromEntries(
      checklist.map((item) => [item.dataset.checklistItem, item.checked])
    );
    localStorage.setItem(storageKey, JSON.stringify(savedItems));
    updateStatus();
  };

  try {
    const savedItems = JSON.parse(localStorage.getItem(storageKey) || "{}");
    checklist.forEach((item) => {
      item.checked = savedItems[item.dataset.checklistItem] === true;
      item.addEventListener("change", saveChecklist);
    });
  } catch {
    checklist.forEach((item) => item.addEventListener("change", saveChecklist));
  }

  resetButton.addEventListener("click", () => {
    checklist.forEach((item) => { item.checked = false; });
    localStorage.removeItem(storageKey);
    updateStatus();
    checklist[0]?.focus();
  });

  updateStatus();
})();
