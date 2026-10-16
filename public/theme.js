// Color theme for the site.
// Loaded synchronously from the layout head so the saved theme is applied
// before first paint, and so the site ships without inline scripts. That
// lets the container's Content-Security-Policy use script-src 'self'.
(function () {
  var root = document.documentElement;

  try {
    if (localStorage.getItem("theme") === "dark") {
      root.setAttribute("data-theme", "dark");
    }
  } catch (e) {}

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function wireButtons() {
    var buttons = document.querySelectorAll("[data-set-theme]");
    function paint() {
      var c = current();
      buttons.forEach(function (b) {
        var on = b.getAttribute("data-set-theme") === c;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-set-theme");
        if (t === "dark") root.setAttribute("data-theme", "dark");
        else root.removeAttribute("data-theme");
        try { localStorage.setItem("theme", t); } catch (e) {}
        paint();
      });
    });
    paint();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireButtons);
  } else {
    wireButtons();
  }
})();
