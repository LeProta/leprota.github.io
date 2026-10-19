'use strict';
importScripts('/storage.js');
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let p = {};
    try { p = event.data ? event.data.json() : {}; } catch { /* Affichage de secours requis. */ }
    const valid = p.schema === 1 && /^[a-f0-9]{40}$/.test(p.id) && safeJournalLink(p.url);
    if (valid) {
      try { await journalRecords({id:p.id, url:safeJournalLink(p.url), date:p.date, receivedAt:Date.now()}); }
      catch { /* Le lien chiffré reste disponible dans les données de notification. */ }
    }
    await self.registration.showNotification(
      valid && typeof p.title === 'string' ? p.title.slice(0,80) : 'Le Journal Financier', {
        body:valid && typeof p.body === 'string' ? p.body.slice(0,240) : 'Une notification a été reçue. Ouvrez l’application pour vérifier votre journal.',
        icon:'/icon-192.png', badge:'/icon-192.png', tag: valid ? 'journal-'+p.id : 'journal-information',
        data:valid ? {id:p.id, url:safeJournalLink(p.url)} : {},
      });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  // Le fragment n’est pas transmis au serveur GitHub Pages.
  const fragment = safeJournalLink(d.url) ? new URLSearchParams({id:d.id, url:d.url}).toString() : '';
  event.waitUntil(self.clients.openWindow('/lecture.html#'+fragment));
});
