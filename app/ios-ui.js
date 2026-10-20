/* Intégrations progressives iOS. Aucun SDK, aucune donnée envoyée à l’ouverture. */
'use strict';
(()=>{
 const root=document.documentElement;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 root.classList.toggle('ios-ui',ios);
 const standalone=matchMedia('(display-mode: standalone)');
 function mode(){root.classList.toggle('installed-app',standalone.matches||navigator.standalone===true);}
 standalone.addEventListener?.('change',mode);mode();
 function appearance(light,home){
  root.style.colorScheme=light?'light':'dark';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=home?'#119bd8':light?'#fafbfc':'#06080b';
 }
 async function shareSource(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Lien source invalide.');
  // Seul le lien public de la source est proposé ; aucun article ou cours privé.
  const payload={title:'Publication source · Le Journal Financier',url:url.href};
  if(typeof navigator.share==='function'){
   try{await navigator.share(payload);return 'shared';}
   catch(error){if(error.name==='AbortError')return 'cancelled';throw new Error('Le partage n’a pas abouti. Réessayez depuis Safari.');}
  }
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);return 'copied';}
  throw new Error('Le partage est indisponible dans ce navigateur.');
 }
 window.JournalNativeUI=Object.freeze({appearance,shareSource,ios});
})();
