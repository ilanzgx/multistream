(function () {
  // only run inside iframes, not the main app frame
  if (window === window.top) return;

  // intercept keydown events inside the iframe and forward to parent
  window.addEventListener("keydown", function (e) {
    if (
      document.activeElement &&
      (document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA" ||
        document.activeElement.isContentEditable)
    )
      return;

    var key = e.key;
    // forward 1-9 (select chat) and S (screenshot)
    if ((key >= "1" && key <= "9") || key === "s" || key === "S") {
      window.parent.postMessage({ type: "SHORTCUT", key: key }, "*");

      e.preventDefault();
      e.stopPropagation();
    }
  });
})();
