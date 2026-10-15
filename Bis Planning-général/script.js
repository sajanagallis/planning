<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Planning général — SAJ Anagallis (V9.6.2)</title>
  <meta name="widget-version" content="9.6.2">
  <link rel="stylesheet" href="style.css?v=9.6.2-pastilles-uniques-20261015">
  <script defer src="https://docs.getgrist.com/grist-plugin-api.js"></script>
  <script defer src="script.js?v=9.6.2-pastilles-uniques-20261015"></script>
</head>
<body>
  <main id="app">
    <header class="toolbar no-print">
      <div class="field"><label for="yearSelect">Année scolaire</label><select id="yearSelect" disabled><option>Chargement…</option></select></div>
      <div class="field"><label for="personSelect">Repérer un usager (écran)</label><select id="personSelect" disabled><option value="">Tous les usagers</option></select></div>
      <div class="field"><label for="paperSelect">Impression / PDF</label><select id="paperSelect"><option value="a3">A3 paysage</option><option value="a4">A4 paysage</option></select></div>
      <div class="field"><label for="viewSelect">Affichage à l'écran</label><select id="viewSelect"><option value="fit">Ajuster à la largeur</option><option value="actual">Taille réelle / faire défiler</option></select></div>
      <button id="refreshBtn" type="button" class="secondary">Actualiser Grist</button>
      <button id="clearSelectionBtn" type="button" class="secondary" hidden>Effacer la sélection</button>
      <button id="printBtn" type="button" disabled>Imprimer</button>
      <button id="pdfBtn" type="button" disabled>Créer un PDF</button>
    </header>

    <div class="messages no-print" aria-live="polite">
      <p id="status">Connexion à Grist…</p>
      <p id="selectionNote" hidden aria-live="polite"></p>
      <p id="paperNote">A3 recommandé. Le bouton « Créer un PDF » télécharge directement un fichier PDF ; « Imprimer » ouvre la fenêtre d’impression.</p>
      <details id="warningDetails" hidden><summary id="warningSummary">Avertissements</summary><ul id="warnings"></ul></details>
    </div>

    <div id="viewport" class="viewport">
      <section id="sheet" class="sheet" hidden aria-label="Planning général imprimable">
        <header class="sheet-title"><strong>Planning SAJ Anagallis</strong><span id="titleYear"></span></header>
        <div class="table-frame">
          <div id="tableHost"></div>
          <!-- Trait d'impression vectoriel indépendant du border-collapse :
               bord extérieur gauche de N° à la dernière ligne d'usagers. -->
          <svg class="left-border-ink" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
            <line x1="2.5" y1="0" x2="2.5" y2="100" stroke="#000" stroke-width="3.2" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>
        <footer class="sheet-footer">
          <div class="legend">
            <span>Temps libre : uniquement si inscrit</span>
            <span>🚪 : groupe ouvert proposé</span>
            <span>🟢 : Dispo</span><span>🟠 : 1er référent principal</span><span>🔴 : 2e référent principal</span><span>Kiné / Ortho (début du RDV)</span>
            <span><i class="swatch absent"></i> Absent (journée)</span>
          </div>
          <div class="date-meta"><span id="footerYear"></span><span id="printDate"></span></div>
        </footer>
      </section>
    </div>
  </main>
  <!-- Fiche des participants affichée seulement après clic, hors de la grille
       et de la zone imprimable. Son placement tient compte du zoom à l'écran. -->
  <aside id="participantsPopover" class="participants-popover no-print" role="dialog"
    aria-modal="false" aria-labelledby="participantsTitle" aria-describedby="participantsMeta"
    tabindex="-1" hidden>
    <div class="participants-popover-heading">
      <div id="participantsPicto" class="participants-popover-icon" role="img" aria-label="Visuel de l’activité"><span class="participants-image-fallback" aria-hidden="true">▦</span></div>
      <div class="participants-popover-titles">
        <strong id="participantsTitle"></strong>
        <span id="participantsMeta"></span>
      </div>
      <button id="participantsClose" type="button" class="participants-popover-close"
        aria-label="Fermer la liste des participants">×</button>
    </div>
    <p id="participantsHours" class="participants-popover-hours" hidden></p>
    <p id="participantsStaff" class="participants-popover-staff" hidden></p>
    <p id="participantsCount" class="participants-popover-count"></p>
    <p id="participantsImagesNote" class="participants-images-note" hidden></p>
    <p id="participantsContext" class="participants-popover-context" hidden></p>
    <ol id="participantsList" class="participants-popover-list"></ol>
  </aside>
</body>
</html>
