'use strict';
const $ = id => document.getElementById(id);
let registration, publicKey, subscription;
const title = $('notification-title'), body = $('notification-body');
function preferences() { return {title:title.value.trim() || 'Le Journal Financier', body:body.value.trim().replace(/\s+/g,' ') || 'Une nouvelle édition est disponible.'}; }
function preview() {
  const p=preferences();
  $('preview-title').textContent=p.title;
  $('preview-body').textContent=p.body.replaceAll('{date}',new Intl.DateTimeFormat('fr-FR').format(new Date()));
  try {localStorage.setItem('journal-notification-preferences',JSON.stringify(p));} catch { /* Facultatif. */ }
}
for (const el of [title,body]) el.addEventListener('input',preview);
function keyBytes(key) { const s=atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)); return Uint8Array.from(s,c=>c.charCodeAt(0)); }
function exportSubscription() { return JSON.stringify({schema:1, applicationServerKey:publicKey, subscription:subscription.toJSON(), preferences:preferences()},null,2); }
function update() {
  $('copy').disabled=!subscription; $('local-test').disabled=!subscription;
  $('unsubscribe').disabled=!subscription;
  $('subscribe').textContent=subscription ? 'Notifications autorisées sur cet appareil' : 'Autoriser les notifications';
  $('subscribe').disabled=!!subscription;
}
(async () => {
  try {
    const saved=JSON.parse(localStorage.getItem('journal-notification-preferences') || 'null');
    if(saved && saved.body === 'Votre édition du {date} est prête.') saved.body = 'Une nouvelle édition est disponible.';
    if(saved){title.value=String(saved.title || '').slice(0,80);body.value=String(saved.body || '').slice(0,240);}
  } catch { /* Pas de préférence enregistrée. */ }
  preview();
  const installed=matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const appleMobile=/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints>1);
  if(appleMobile && !installed){$('status').textContent='Ajoutez d’abord cette page à l’écran d’accueil, puis ouvrez la nouvelle icône pour activer les notifications.';return;}
  if(!isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)){
    $('status').textContent='Ce navigateur ne permet pas les notifications web. Sur iPhone, utilisez une version récente d’iOS et l’application ajoutée à l’écran d’accueil.';return;
  }
  try {
    const response=await fetch('push-config.json',{cache:'no-store'});
    if(!response.ok)throw new Error();
    publicKey=(await response.json()).publicKey;
    if(typeof publicKey !== 'string' || keyBytes(publicKey).length!==65)throw new Error();
    await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
    registration=await navigator.serviceWorker.ready;
    subscription=await registration.pushManager.getSubscription();
    const sameKey = !subscription || (subscription.options.applicationServerKey &&
      Array.from(new Uint8Array(subscription.options.applicationServerKey)).join()===Array.from(keyBytes(publicKey)).join());
    if(!sameKey){$('status').textContent='La clé d’envoi a changé : désactivez cet ancien abonnement puis autorisez à nouveau les notifications.';update();return;}
    update();
    if(Notification.permission==='denied'){$('status').textContent='Notifications refusées. Réactivez-les dans les réglages de l’appareil pour cette application.';return;}
    $('subscribe').disabled=!!subscription;
    $('status').textContent=subscription ? 'Autorisation enregistrée sur cet appareil. Copiez la connexion dans GitHub, puis effectuez un test à distance.' : 'Application prête. Touchez le bouton pour demander l’autorisation.';
  } catch { $('status').textContent='La configuration n’a pas pu être chargée. Vérifiez votre connexion puis rouvrez l’application.'; }
})();
$('subscribe').addEventListener('click',async () => {
  $('subscribe').disabled=true;
  try {
    // Demande directement dans le geste utilisateur, avant toute autre opération asynchrone.
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error();
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
    update();$('status').textContent='Autorisation enregistrée. Il reste à copier la connexion privée dans GitHub et à tester l’envoi.';
  } catch { $('status').textContent='Autorisation ou inscription non aboutie. Vérifiez les réglages de notifications et la connexion.';$('subscribe').disabled=false; }
});
$('copy').addEventListener('click',async () => {
  if(!subscription)return;
  const text=exportSubscription();
  try { await navigator.clipboard.writeText(text);$('copy-status').textContent='Connexion copiée. Collez-la uniquement dans le secret GitHub WEBPUSH_SUBSCRIPTION_JSON, puis enregistrez-le.'; }
  catch { $('manual-copy').hidden=false;$('manual-copy').open=true;$('subscription-output').value=text;$('subscription-output').select();$('copy-status').textContent='Copiez manuellement le texte confidentiel ci-dessous.'; }
});
$('local-test').addEventListener('click',async () => {
  try {const p=preferences();await registration.showNotification(p.title,{body:p.body.replaceAll('{date}',new Intl.DateTimeFormat('fr-FR').format(new Date())),icon:'/icon-192.png',tag:'journal-local-test'});$('copy-status').textContent='Test local affiché : il ne valide pas encore l’envoi depuis GitHub.';}
  catch {$('copy-status').textContent='Affichage refusé. Vérifiez les réglages de notifications.';}
});
$('unsubscribe').addEventListener('click',async () => {
  try {
    if(subscription && !(await subscription.unsubscribe()))throw new Error();
    subscription=null;
    await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('journal-notifications');r.onsuccess=resolve;r.onerror=r.onblocked=reject;});
    localStorage.removeItem('journal-notification-preferences');
    $('subscription-output').value='';$('manual-copy').hidden=true;update();$('subscribe').disabled=false;
    $('status').textContent='Abonnement désactivé et historique local effacé. Supprimez aussi l’ancien secret WEBPUSH_SUBSCRIPTION_JSON dans GitHub.';
  }catch{$('status').textContent='Désactivation incomplète : vérifiez les réglages de l’appareil et effacez les données du site si nécessaire.';}
});
