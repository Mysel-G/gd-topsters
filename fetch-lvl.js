(async function fetchLevels(searchTerm) {
  const allowUnratedRated = document.querySelector(
    ".sidebar-options-allow-unrated-checkbox",
  ).checked
    ? 0
    : 1;

  const secret = "Wmfd2893gb7";
  const data = {
    str: searchTerm,
    star: allowUnratedRated,
    secret: "Wmfd2893gb7",
  };
})();
