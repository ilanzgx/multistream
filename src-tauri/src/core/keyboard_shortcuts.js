(function () {
  // only run inside iframes, not the main app frame
  if (window === window.top) return;

  // intercept keydown events inside the iframe and forward to parent
  window.addEventListener("keydown", function (e) {
    // allow platform players to handle their own shortcuts first
    // only forward 1-9 keys to parent so the parent can select chats
    if (e.key >= "1" && e.key <= "9") {
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.isContentEditable)
      )
        return;

      window.parent.postMessage({ type: "SHORTCUT", key: e.key }, "*");

      e.preventDefault();
      e.stopPropagation();
    }
  });
})();
