'use strict';
(async () => {
  const status = document.getElementById('read-status');
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    let url = safeJournalLink(params.get('url'));
    if (!url) {
      const rows = await journalRecords();
      const row = params.get('id') ? rows.find(r => r.id === params.get('id')) : rows[0];
      url = row && safeJournalLink(row.url);
    }
    // Effacer le lien privé de l’historique de cette page.
    history.replaceState(null, '', location.pathname);
    if (!url) { status.textContent = 'Aucune édition reçue sur cet appareil. Une notification envoyée depuis GitHub permettra d’ouvrir le journal ici.'; return; }
    const link = document.getElementById('read-link'); link.href = url; link.hidden = false;
    status.textContent = 'Ouverture du PDF privé dans Google Drive… Si l’ouverture automatique est bloquée, utilisez le bouton.';
    location.replace(url);
  } catch { status.textContent = 'La lecture locale est indisponible. Rouvrez la notification ou accédez au journal dans l’app Fichiers.'; }
})();
