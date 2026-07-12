// ─── Ampoule d'aide « Comprendre cet outil » ────────────────────────────────
// Chaque bouton .help-bulb pilote l'encart .help-pop qui le suit dans le DOM
// (ou celui désigné par l'attribut data-help-target). Clic pour ouvrir/fermer ;
// Échap ou clic à l'extérieur referme. Voir help-bulb.css pour le balisage.
(function () {
  function popFor(btn) {
    var sel = btn.getAttribute('data-help-target');
    if (sel) return document.querySelector(sel);
    // L'encart est le .help-pop du même en-tête (il ne suit pas forcément
    // le bouton dans le DOM : l'eyebrow et le titre s'intercalent).
    var scope = btn.closest('.tool-has-help') || document;
    return scope.querySelector('.help-pop');
  }

  function close(btn, pop) {
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    if (pop) pop.hidden = true;
  }

  function closeAll(except) {
    document.querySelectorAll('.help-bulb.is-open').forEach(function (b) {
      if (b === except) return;
      close(b, popFor(b));
    });
  }

  function init() {
    var bulbs = document.querySelectorAll('.help-bulb');
    if (!bulbs.length) return;

    bulbs.forEach(function (btn) {
      var pop = popFor(btn);
      if (!pop) return;
      btn.setAttribute('aria-expanded', 'false');
      pop.hidden = true;

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = pop.hidden;
        closeAll(btn);
        if (willOpen) {
          pop.hidden = false;
          btn.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        } else {
          close(btn, pop);
        }
      });
      // Un clic dans l'encart ne doit pas le refermer.
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
