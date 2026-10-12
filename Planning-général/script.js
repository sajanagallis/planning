/*
 * Planning général SAJ Anagallis V9.6 — sélection usager / participants d’activité, PDF direct — lecture seule, données Grist.
 * Une grande case « Activités » par usager et demi-journée ; les deux
 * premières activités inscrites, ou proposées en groupe ouvert si la demi-journée
 * est libre, y sont listées. Autre colonne : Kiné/Ortho.
 * Aucun « X », aucune participation déduite, aucun horaire d'activité imprimé.
 * Impression via fenêtre native. Création PDF directe locale, sans service tiers.
 * Schéma fondé sur l'export .grist « Planning d'activités - SAJ Anagallis ».
 */
(() => {
  'use strict';
  const TABLES = {
    users:'Usagers', years:'Annees', activities:'Activites', participations:'Participations',
    animators:'Animateurs', days:'Jours_de_la_semaine', hours:'Heures',
    reeducations:'Reeducations', rehabTypes:'Activites_autres',
    annualPresence:'Presences_annuelles', forecasts:'Planning_previsionnel'
  };
  const REQUIRED = ['users','years','activities','participations','animators','days','hours','reeducations','rehabTypes'];
  const DAYS = [
    {i:1, label:'Lundi',flag:'Lu', color:'#159fdc'},
    {i:2, label:'Mardi',flag:'Ma',color:'#24b34c'},
    {i:3, label:'Mercredi',flag:'Me',color:'#bb55d5'},
    {i:4, label:'Jeudi',flag:'Je',color:'#f1a91f'},
    {i:5, label:'Vendredi',flag:'Ve',color:'#d65158'}
  ];
  const HALVES = [{value:'matin',label:'Matin'},{value:'apres-midi',label:'Après-midi'}];
  const CUTOFF=12*60+30;
  const state={raw:{},byId:{},columns:{},existing:[],yearId:null,currentYearId:null,userId:null,
    activitySelection:null,selectionMessage:"",popoverAnchor:null,loaded:false,loading:false,paper:'a3',model:null,refreshTimer:null};
  const $=id=>document.getElementById(id);
  const text=v=>v==null?'':String(v).trim();
  const esc=v=>text(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const trueValue=v=>v===true||v===1||v==='1'||norm(v)==='true';
  const unique=arr=>[...new Set(arr.filter(Boolean))];
  function decode(v){try{return typeof window.grist?.decodeObject==='function'?grist.decodeObject(v):v;}catch(_){return v;}}
  function refs(v){
    v=decode(v);
    if(typeof v==='string'&&v.trim().startsWith('[')){try{v=JSON.parse(v);}catch(_){}}
    if(Array.isArray(v)){
      if(v[0]==='L'||v[0]==='l')v=v.slice(1);
      return v.flatMap(x=>{const n=Number(x);return Number.isInteger(n)&&n>0?[n]:[];});
    }
    const n=Number(v);return Number.isInteger(n)&&n>0?[n]:[];
  }
  const ref=v=>refs(v)[0]||0;
  function names(v){
    v=decode(v);
    if(typeof v==='string'&&v.trim().startsWith('[')){try{v=JSON.parse(v);}catch(_){}}
    if(Array.isArray(v)){
      if(v[0]==='L')v=v.slice(1);
      return v.filter(x=>typeof x==='string'&&text(x)).map(text);
    }
    const s=text(v);
    return s&&!/^\[?\s*[Ll]?,?\s*\d+(?:,\s*\d+)*\s*\]?$/.test(s)?[s]:[];
  }
  function rowsFrom(data){
    return Array.isArray(data?.id)?data.id.map((id,i)=>{
      const r={id:Number(id)};
      for(const [k,v] of Object.entries(data)) if(Array.isArray(v))r[k]=decode(v[i]);
      return r;
    }):[];
  }
  function show(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
  function warnings(items){
    const list=unique(items);const details=$('warningDetails');
    $('warnings').replaceChildren(...list.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));
    details.hidden=list.length===0;
    $('warningSummary').textContent=`${list.length} remarque${list.length>1?'s':''} — afficher les détails`;
    if(!list.length)details.open=false;
  }
  function clock(v){
    const raw=state.byId.hours.get(ref(v))?.Heures;
    return text(raw|| (typeof v==='string'&&!ref(v)?v:''));
  }
  function minutes(v){
    const match=text(v).match(/\b(\d{1,2})\s*[h:]\s*(\d{1,2})?/i);
    return match?+match[1]*60+ +(match[2]||0):Number.NaN;
  }
  // Seule l'heure de DÉBUT est imprimée, même si la valeur Grist
  // est un créneau complet (« 9h30 - 10h15 », « 09:30 à 10:15 », etc.).
  function simpleHour(v){
    const m=text(v).match(/\b([01]?\d|2[0-3])\s*[h:]\s*([0-5]?\d)?/i);
    return m?`${+m[1]}h${m[2]&&+m[2]?String(+m[2]).padStart(2,'0'):''}`:'';
  }
  // Uniformiser le titre : « 2026-27 » devient « 2026-2027 ».
  function fullSchoolYear(v){
    const s=text(v);
    return s.replace(/(\d{4})\s*[-–—/]\s*(\d{2}|\d{4})(?!\d)/g,(_,start,end)=>{
      const a=Number(start);
      let b=Number(end);
      if(end.length===2){b=Math.floor(a/100)*100+b;if(b<=a)b+=100;}
      return `${start}-${b}`;
    });
  }
  function halfFrom(when,creneau){
    const slot=norm(creneau);
    if(/apres midi|apresmidi|apm|apres\b/.test(slot))return 'apres-midi';
    if(/\bmatin\b|^am$/.test(slot))return 'matin';
    const m=minutes(when);
    return Number.isFinite(m)?m<CUTOFF?'matin':'apres-midi':null;
  }
  function dayFrom(v,fallback){
    const d=Number(state.byId.days.get(ref(v))?.Num_jour||fallback);
    return d>=1&&d<=5?d:0;
  }
  function dayColor(day){
    const row=(state.raw.days||[]).find(d=>Number(d.Num_jour)===day.i);
    const c=text(row?.Couleur);
    return /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(c)?c:day.color;
  }
  const isFree=s=>/\btemps libres?\b|\btemps perso(?:nnel)?\b|^libre$/.test(norm(s));
  const isReference=s=>/\btemps (?:de )?(?:reference|referent|ref)\b/.test(norm(s)); // ignorés dans cette version
  const isRehab=s=>/\bkine\b|\bkinesitherap|\bortho\b|orthophon/.test(norm(s));
  const noStaff=s=>norm(s)==='accueil'; // Nul Bar ailleurs : afficher les salariés comme toutes les activités.
  // Le statut est utilisé uniquement pour la FORME du nom, jamais pour la couleur.
  // Choices réelles de Grist : « Salarié⋅e SAJ », « Salarié⋅e LTC »,
  // « Salarié⋅e Odynéo », « Intervenant⋅e », « Bénévole ».
  function shortStaffName(p){
    const status=norm(p?.Status);
    const first=text(p?.Prenom),last=text(p?.Nom),complete=text(p?.Nom2);
    if(/\b(saj|ltc)\b/.test(status))return first||complete||last;
    if(/\b(intervenant|benevole)\b/.test(status))return [first,last].filter(Boolean).join(' ')||complete;
    // Autre statut (ex. salarié Odynéo) : ne pas présumer un statut SAJ/LTC.
    return [first,last].filter(Boolean).join(' ')||complete;
  }
  function fullName(p){return [text(p?.Prenom),text(p?.Nom)].filter(Boolean).join(' ')||text(p?.Nom2);}
  function staffVariants(p){
    const first=text(p?.Prenom),last=text(p?.Nom);
    return unique([fullName(p),text(p?.Nom2),[last,first].filter(Boolean).join(' ')]).map(norm).filter(Boolean);
  }
  // Index des professionnels à partir de la table Animateurs.
  // Une même personne peut apparaître sous « Prénom NOM », « NOM Prénom »,
  // ou dans une RefList affichée comme une suite de noms.
  function staffDirectory(rows){
    const byName=new Map();
    for(const p of rows){
      for(const key of staffVariants(p)){
        const list=byName.get(key)||[];
        if(!list.some(other=>other.id===p.id))list.push(p);
        byName.set(key,list);
      }
    }
    return byName;
  }
  function matchDisplayedStaff(written,byName){
    const label=norm(written);
    if(!label)return [];
    const exact=byName.get(label);
    if(exact?.length===1)return exact;
    // Une formule de Grist peut retourner plusieurs noms dans une même chaîne.
    // Faire correspondre chaque NOM COMPLET à la table Animateurs, puis
    // convertir une seule fois le nom selon Status.
    let remaining=` ${label} `;
    const selected=[];
    for(const [key,people] of [...byName.entries()].sort((a,b)=>b[0].length-a[0].length)){
      if(key.length<5||people.length!==1)continue;
      const token=` ${key} `;
      if(remaining.includes(token)){
        const person=people[0];
        if(!selected.some(p=>p.id===person.id))selected.push(person);
        remaining=remaining.replace(token,' ');
      }
    }
    return selected;
  }
  function staffFor(a,staffByName,notes){
    const idList=refs(a.Animateur_s);
    const found=[];
    for(const id of idList){
      const p=state.byId.animators.get(id);
      if(p&&!found.some(x=>x.id===p.id))found.push(p);
      else if(!p)notes.push(`Référence animateur introuvable pour : ${text(a.Nom_activite)} (ID ${id}).`);
    }
    const displayed=unique(names(a.gristHelper_Display).concat(names(a.Animateur_s2)));
    const unresolved=[];
    for(const written of displayed){
      const matches=matchDisplayedStaff(written,staffByName);
      if(matches.length){
        for(const p of matches)if(!found.some(x=>x.id===p.id))found.push(p);
        // Ne JAMAIS ajouter le libellé complet en plus du prénom formaté :
        // c'était la cause des noms « Nadège THIVEL » en V6.
        continue;
      }
      // Si les références ont permis de retrouver le ou les professionnels,
      // la colonne d'affichage ne doit pas rajouter une variante de leur nom.
      if(found.length)continue;
      unresolved.push(written);
    }
    if(!found.length && unresolved.length){
      notes.push(`Statut du professionnel non vérifiable pour « ${text(a.Nom_activite)} » : ${unresolved.join(' / ')}. Vérifier la référence Animateur_s.`);
      // Sans statut confirmé, ne pas prétendre que le professionnel est salarié SAJ.
      // Le nom d'affichage de Grist est conservé et signalé à vérifier.
      return unresolved.join(' · ');
    }
    if(!found.length&&!noStaff(a.Nom_activite)&&!isFree(a.Nom_activite)&&!isReference(a.Nom_activite))
      notes.push(`Professionnel non retrouvé : ${text(a.Nom_activite)} (vérifier Activites.Animateur_s).`);
    return unique(found.map(shortStaffName)).join(' · ');
  }
  function sortedYears(){return [...(state.raw.years||[])].sort((a,b)=>Number(b.Debut||0)-Number(a.Debut||0)||text(b.Annee).localeCompare(text(a.Annee),'fr',{numeric:true}));}
  function fillYears(){
    const years=sortedYears();state.currentYearId=Number(years.find(y=>norm(y.Etat)==='actuel')?.id)||null;
    if(!years.some(y=>y.id===state.yearId))state.yearId=state.currentYearId||years[0]?.id||null;
    const select=$('yearSelect');select.replaceChildren();
    for(const y of years){const o=document.createElement('option');o.value=y.id;o.textContent=`${text(y.Annee)||'Année '+y.id}${y.id===state.currentYearId?' (actuel)':''}`;select.append(o);}
    select.value=state.yearId||'';select.disabled=years.length===0;
  }
  function fillUsers(people){
    const select=$('personSelect');
    if(!people.some(p=>p.id===state.userId))state.userId=null;
    select.innerHTML='<option value="">Tous les usagers</option>';
    for(const p of people){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;select.append(o);}
    select.value=state.userId||'';select.disabled=people.length===0;
  }
  async function load(){
    if(state.loading)return;
    hideParticipantsPopover();
    state.loading=true;state.loaded=false;
    $('refreshBtn').disabled=true;$('printBtn').disabled=true;$('pdfBtn').disabled=true;
    show('Lecture des tables Grist…');
    try{
      if(!window.grist?.docApi)throw Error('Ouvrir le widget dans Grist et autoriser l’accès complet au document.');
      const existing=await grist.docApi.listTables();state.existing=existing;
      const missing=REQUIRED.filter(key=>!existing.includes(TABLES[key]));
      if(missing.length)throw Error('Tables absentes : '+missing.map(k=>TABLES[k]).join(', '));
      const result=await Promise.all(Object.entries(TABLES).map(async ([key,name])=>{
        if(!existing.includes(name))return [key,[],[]];
        const t=await grist.docApi.fetchTable(name);
        return [key,rowsFrom(t),Object.keys(t||{})];
      }));
      state.raw={};state.byId={};state.columns={};
      for(const [key,rows,cols] of result){state.raw[key]=rows;state.byId[key]=new Map(rows.map(r=>[r.id,r]));state.columns[key]=cols;}
      state.loaded=true;fillYears();render();
    }catch(e){console.error(e);show('Impossible de charger le planning : '+(e?.message||e),true);$('sheet').hidden=true;warnings([]);}
    finally{state.loading=false;$('refreshBtn').disabled=false;}
  }
  function modelForYear(){
    const errors=[],notes=[];
    const year=state.byId.years.get(Number(state.yearId));
    if(!year)return {year:null,people:[],errors:['Année indisponible'],notes};
    const yearId=year.id;const isCurrent=yearId===state.currentYearId;
    const allPeople=state.raw.users.map(u=>({id:u.id,last:text(u.Nom),first:text(u.Prenom),
      name:`${text(u.Nom).toUpperCase()} ${text(u.Prenom)}`.trim(),gone:trueValue(u.Parti_e),source:u,flags:null}));
    const peopleById=new Map(allPeople.map(p=>[p.id,p]));
    const assigned=new Map();const attachedPeople=new Set();const usedActs=new Set();
    const forecast=norm(year.Etat)==='prevision';
    const enrollmentRows=forecast ? state.raw.forecasts : state.raw.participations;
    if(forecast&&!state.existing.includes(TABLES.forecasts))errors.push('Table Planning_previsionnel absente pour une année en prévision.');
    for(const p of enrollmentRows){
      if(ref(p.Annee)!==yearId)continue;
      const actId=ref(p.Activites),a=state.byId.activities.get(actId);
      if(!a){notes.push('Une inscription renvoie vers une activité inexistante.');continue;}
      if(ref(a.Annee)&&ref(a.Annee)!==yearId){errors.push(`Activité « ${text(a.Nom_activite)} » reliée à une année différente.`);continue;}
      if(!assigned.has(actId))assigned.set(actId,new Set());
      for(const userId of refs(p.Participants)){assigned.get(actId).add(userId);attachedPeople.add(userId);}
      usedActs.add(actId);
    }
    const presenceRows=state.raw.annualPresence.filter(r=>ref(r.Annee)===yearId);
    const presenceByUser=new Map();
    for(const r of presenceRows){
      const id=ref(r.Usager)||ref(r.Usagers);
      if(id){if(presenceByUser.has(id))errors.push('Présences annuelles en double pour un usager.');presenceByUser.set(id,r);}
    }
    const people=allPeople.filter(p=>isCurrent?!p.gone:presenceByUser.size?presenceByUser.has(p.id):attachedPeople.has(p.id))
      .sort((a,b)=>a.last.localeCompare(b.last,'fr',{sensitivity:'base'})||a.first.localeCompare(b.first,'fr',{sensitivity:'base'}));
    if(!isCurrent&&!presenceByUser.size){errors.push('Présences annuelles historiques absentes : créer/renseigner Presences_annuelles pour cette année.');}
    for(const person of people){
      const presence=presenceByUser.get(person.id)||(isCurrent?person.source:null);
      person.flags=presence?DAYS.map(d=>trueValue(presence[d.flag])):null;
      if(!presence)errors.push(`Jours de présence inconnus pour ${person.name}.`);
      if(isCurrent&&presenceByUser.size&&!presenceByUser.has(person.id))notes.push(`Présences_annuelles : ligne manquante pour ${person.name} (valeurs Usagers utilisées).`);
    }
    if(!people.length)errors.push('Aucun usager pour cette année.');
    const animatorByName=staffDirectory(state.raw.animators);
    const cells=new Map();
    const openActivities=[];
    function bucket(userId,day,half){const key=`${userId}|${day}|${half}`;if(!cells.has(key))cells.set(key,{activities:[],rehab:[]});return cells.get(key);}
    let activityCount=0;
    for(const [actId,participants] of assigned){
      const a=state.byId.activities.get(actId);if(!a)continue;
      const day=dayFrom(a.Jour,a.Numero_du_jour_de_la_semaine);
      const start=clock(a.Heure_debut)||text(a.gristHelper_Display3);
      let half=halfFrom(start,a.Creneau);
      if(!half){
        const sample=enrollmentRows.find(p=>ref(p.Activites)===actId);
        half=halfFrom(start,sample?.Activites_Creneau);
      }
      if(!day||!half){errors.push(`Jour ou demi-journée inconnus : ${text(a.Nom_activite)}.`);continue;}
      const specialFree=isFree(a.Nom_activite),specialRef=isReference(a.Nom_activite);
      if(specialRef)continue; // Colonnes et activités « Temps de référence » supprimées.
      const staff=specialFree?'':staffFor(a,animatorByName,notes);
      const item={id:actId,name:text(a.Nom_activite)||'Activité',sort:Number.isFinite(minutes(start))?minutes(start):9999,staff,open:false};
      for(const userId of participants){
        if(!peopleById.has(userId)){notes.push(`Participant ${userId} introuvable pour ${item.name}.`);continue;}
        const entry=bucket(userId,day,half);
        entry.activities.push(item);
      }
      activityCount++;
    }
    // Groupe ouvert : inscrit dans Activites.Groupe_ouvert.
    // Règle : le proposer uniquement aux usagers présents qui n'ont AUCUNE
    // inscription sur la même demi-journée (y compris temps libre).
    // Une proposition de groupe ouvert reste visuellement distincte d'une inscription.
    // Pour éviter de réutiliser une activité d'une autre année, les groupes ouverts
    // sans champ Annee sont proposés seulement pour l'année actuelle.
    for(const a of state.raw.activities){
      if(!trueValue(a.Groupe_ouvert))continue;
      const activityYear=ref(a.Annee);
      if(activityYear?activityYear!==yearId:!isCurrent)continue;
      const day=dayFrom(a.Jour,a.Numero_du_jour_de_la_semaine);
      const start=clock(a.Heure_debut)||text(a.gristHelper_Display3);
      const half=halfFrom(start,a.Creneau);
      if(!day||!half){notes.push(`Groupe ouvert sans jour/créneau identifié : ${text(a.Nom_activite)}.`);continue;}
      if(isReference(a.Nom_activite))continue;
      const staff=isFree(a.Nom_activite)?'':staffFor(a,animatorByName,notes);
      openActivities.push({id:a.id,day,half,name:text(a.Nom_activite)||'Activité ouverte',
        sort:Number.isFinite(minutes(start))?minutes(start):9999,staff,open:true});
    }
    // Un groupe ouvert n'est JAMAIS une inscription. Il est proposé seulement
    // aux usagers présents dont la demi-journée n'a aucune activité inscrite.
    // Limiter les propositions à deux AVANT le rendu évite de créer des cellules
    // artificiellement surchargées. Les activités enregistrées sont prioritaires.
    let proposedOpen=0,openSlots=0,hiddenOpenOffers=0;
    const availableOpen=new Map();
    for(const a of openActivities){
      const key=`${a.day}|${a.half}`;
      if(!availableOpen.has(key))availableOpen.set(key,[]);
      availableOpen.get(key).push(a);
    }
    for(const [key,offers] of availableOpen){
      offers.sort((a,b)=>a.sort-b.sort||a.name.localeCompare(b.name,'fr',{sensitivity:'base'})||a.id-b.id);
      // Une même activité peut apparaître plusieurs fois dans une table Grist,
      // mais on ne la propose pas deux fois au même usager.
      const seen=new Set();
      availableOpen.set(key,offers.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);return true;}));
    }
    for(const person of people){
      for(const day of DAYS){
        if(person.flags?.[day.i-1]!==true)continue;
        for(const half of HALVES){
          const cell=bucket(person.id,day.i,half.value);
          if(cell.activities.length)continue; // Même « Temps libre » empêche une proposition.
          const offers=availableOpen.get(`${day.i}|${half.value}`)||[];
          if(!offers.length)continue;
          const chosen=offers.slice(0,2);
          cell.activities.push(...chosen);
          proposedOpen+=chosen.length;
          openSlots++;
          hiddenOpenOffers+=Math.max(0,offers.length-chosen.length);
        }
      }
    }
    for(const entry of cells.values()){
      entry.activities.sort((a,b)=>a.sort-b.sort||a.name.localeCompare(b.name,'fr'));
    }
    // Le nombre normal de propositions n'est pas un avertissement ; il est donné dans le statut.
    if(hiddenOpenOffers)notes.push(`${hiddenOpenOffers} autres possibilités de groupes ouverts non affichées (deux propositions maximum par demi-journée, choisies par horaire de début).`);

    const rehabHasYear=state.columns.reeducations.includes('Annee');
    if(!rehabHasYear&&!isCurrent)errors.push('Reeducations.Annee absent : impossible de restituer les rendez-vous des années archivées.');
    const kineCount=new Map();let rehabCount=0;
    for(const r of state.raw.reeducations){
      if(rehabHasYear?(ref(r.Annee)!==yearId):!isCurrent)continue;
      if(rehabHasYear&&!ref(r.Annee)){notes.push('Un rendez-vous Rééducation n’a pas d’année attribuée.');continue;}
      const type=state.byId.rehabTypes.get(ref(r.Type));const kind=text(type?.Type)||text(r.gristHelper_Display6)||text(r.gristHelper_Display);
      if(!isRehab(kind))continue;
      const userId=ref(r.Usagers),day=dayFrom(r.Jour,r.Jour_Num_jour||r.Num_du_jour);
      const hour=clock(r.Horaire)||text(r.gristHelper_Display3);
      const half=halfFrom(hour,null),short=simpleHour(hour);
      if(!userId||!day||!half||!short){errors.push(`Rendez-vous incomplet : ${kind||'Kiné/Ortho'} (usager, jour ou horaire).`);continue;}
      if(norm(kind).includes('kine')){
        const k=`${userId}|${day}`;kineCount.set(k,(kineCount.get(k)||0)+1);
        if(kineCount.get(k)>1)errors.push(`Plusieurs rendez-vous kiné le même jour pour ${peopleById.get(userId)?.name||userId}.`);
      }
      bucket(userId,day,half).rehab.push({kind:/ortho/.test(norm(kind))?'Ortho':'Kiné',hour:short});rehabCount++;
    }
    for(const p of people){for(const d of DAYS){
      if(p.flags?.[d.i-1]===false){
        for(const half of HALVES){const b=cells.get(`${p.id}|${d.i}|${half.value}`);
          if(b&&(b.activities.length||b.rehab.length))notes.push(`Données planifiées un jour d’absence : ${p.name}, ${d.label}.`);
        }
      }
    }}
    const maxEntries=Math.max(0,...[...cells.values()].map(x=>x.activities.length));
    if(maxEntries>2){
      const hidden=[...cells.values()].reduce((n,c)=>n+Math.max(0,c.activities.length-2),0);
      notes.push(`${hidden} activité(s) inscrite(s) supplémentaires non affichée(s) : seules les 2 premières par demi-journée sont retenues (heure de début, puis nom).`);
    }
    return {year,people,cells,errors,notes:unique(notes),activityCount,rehabCount,maxEntries,openSlots,proposedOpen};
  }
  function renderEvent(event){
    const showStaff=!noStaff(event.name)&&!isFree(event.name)&&!!event.staff;
    // Chaque libellé porte le nom normalisé de l’activité. Le clic ne
    // sélectionne QUE les inscriptions confirmées du même jour et créneau.
    // La case peut contenir deux activités : elles restent indépendantes.
    return `<div class="activity-item" role="button" tabindex="0" aria-pressed="false"
      data-activity-name="${esc(norm(event.name))}" data-open="${event.open?'1':'0'}"
      aria-label="${esc(event.open?'Groupe ouvert proposé : '+event.name:'Afficher les participants inscrits à '+event.name)}"
      title="${esc(event.name+(showStaff?' — '+event.staff:'')+(event.open?' (groupe ouvert, inscription non confirmée)':''))}">
      <span class="activity-name">${esc(isFree(event.name)?'Temps libre':event.name)}${event.open?'<span class="open-tag" aria-label="Activité ouverte proposée" title="Activité ouverte (non inscrite)"> ◇</span>':''}</span>
      ${showStaff?`<span class="activity-staff">${esc(event.staff)}</span>`:''}
    </div>`;
  }
  function cellsFor(person,day,half){
    const halfStart=half.value==='matin'?'day-start':'half-start';
    const b=state.model.cells.get(`${person.id}|${day.i}|${half.value}`)||{activities:[],rehab:[]};
    const acts=b.activities.slice(0,2).map(renderEvent).join('');
    const kine=b.rehab.map(e=>`<span class="rehab-entry" title="${esc(e.kind+' '+e.hour)}">${esc(e.hour)}</span>`).join('');
    return `<td class="activities ${halfStart}" data-day="${esc(day.label)}" data-day-index="${day.i}" data-half="${esc(half.label)}" data-half-value="${half.value}"><div class="events">${acts}</div></td>
      <td class="rehab" data-day="${esc(day.label)}" data-half="${esc(half.label)}" title="${esc(b.rehab.map(x=>x.kind+' '+x.hour).join(' / '))}">${kine}</td>`;
  }
  function render(){
    hideParticipantsPopover();
    if(!state.loaded)return;
    const model=modelForYear();state.model=model;
    if(!model.year){$('sheet').hidden=true;show('Aucune année',true);warnings(model.errors);return;}
    fillUsers(model.people);
    $('titleYear').textContent=fullSchoolYear(model.year.Annee);
    $('footerYear').textContent='SAJ Anagallis · '+fullSchoolYear(model.year.Annee);
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR').format(new Date());
    // A3 : hauteur disponible 287 mm moins les en-têtes, la légende et les marges.
    const minRow=5.5,maxRow=10.4,usableRows=243;
    const target=model.people.length?Math.min(maxRow,usableRows/model.people.length):maxRow;
    document.documentElement.style.setProperty('--row-mm',`${Math.max(minRow,target).toFixed(2)}mm`);
    if(model.people.length&&target<minRow)model.errors.push('Nombre d’usagers trop élevé pour garder des cases lisibles sur une page A3.');
    const dayHeads=DAYS.map(d=>`<th colspan="4" class="day-label day-start" style="background:${dayColor(d)}">${esc(d.label)}</th>`).join('');
    const periodHeads=DAYS.map(d=>HALVES.map(h=>`<th colspan="2" class="half-label ${h.value==='matin'?'day-start':'half-start'}">${esc(h.label)}</th>`).join('')).join('');
    const types=DAYS.map(d=>HALVES.map(h=>`<th class="type-label ${h.value==='matin'?'day-start':'half-start'}">Activités</th><th class="type-label rehab-header">Kiné / Ortho</th>`).join('')).join('');
    const body=model.people.map((p,i)=>{
      let tds='';
      for(const d of DAYS){
        if(p.flags?.[d.i-1]===false)tds+=`<td class="absent day-start" data-day="${esc(d.label)}" data-half="journée" colspan="4">Absent</td>`;
        else for(const h of HALVES)tds+=cellsFor(p,d,h);
      }
      return `<tr data-user="${p.id}"><td class="identity number" title="Cliquer pour sélectionner ${esc(p.name)}">${i+1}</td><td class="identity user" role="button" tabindex="0" title="Sélectionner ${esc(p.name)}" aria-label="Mettre en évidence toute la semaine de ${esc(p.name)}"><span class="user-label">${esc(p.name)}</span></td>${tds}</tr>`;
    }).join('');
    const html=`<table class="planning" aria-label="Planning général SAJ Anagallis"><colgroup>
      <col style="width:7mm"><col style="width:34mm">${Array.from({length:10},()=>'<col style="width:29.3mm"><col style="width:7.5mm">').join('')}</colgroup>
      <thead><tr><th rowspan="3" class="num-col">N°</th><th rowspan="3" class="name-col">Usagers</th>${dayHeads}</tr>
      <tr>${periodHeads}</tr><tr>${types}</tr></thead><tbody>${body}</tbody></table>`;
    $('tableHost').innerHTML=html;$('sheet').hidden=false;
    applyHighlights();
    // Ligne identique pour tous les usagers : chaque zone d'activités est bornée
    // à la hauteur de sa ligne ; réduction locale de la police si nécessaire.
    fitCellText(model);
    warnings([...model.errors,...model.notes]);
    const ok=model.people.length>0&&!model.errors.length;
    $('printBtn').disabled=!ok;$('pdfBtn').disabled=!ok;
    show(`${model.people.length} usagers · ${model.activityCount} activités inscrites · ${model.openSlots} créneaux avec proposition ouverte · ${model.rehabCount} rendez-vous kiné/ortho. ${ok?'Planning prêt à être vérifié et imprimé.':'Vérifier les problèmes signalés avant impression.'}`,!ok);
    fitScreen();
    calculatePrintFit();
  }
  // Modes exclusifs, écran uniquement :
  // - userId : la ligne complète d’un usager ;
  // - activitySelection : tous les inscrits à un nom d’activité donné,
  //   pour UN jour et UNE demi-journée (les groupes ouverts ne comptent pas).
  // Leurs styles ne modifient ni les dimensions ni le PDF.
  function activityParticipants(selection){
    const people=new Set();
    if(!selection||!state.model)return people;
    for(const person of state.model.people){
      // Une inscription sur une journée d’absence n’est pas montrée comme
      // participation effective au créneau choisi.
      if(person.flags?.[selection.day-1]!==true)continue;
      const cell=state.model.cells.get(`${person.id}|${selection.day}|${selection.half}`);
      if(cell?.activities.some(a=>!a.open&&norm(a.name)===selection.name))people.add(person.id);
    }
    return people;
  }
  function applyHighlights(){
    const selected=state.activitySelection;
    const participants=activityParticipants(selected);
    const table=$('tableHost').querySelector('table');
    const users=state.model?.people||[];
    const oneUser=state.userId&&users.find(p=>p.id===state.userId);
    const selectionNote=$('selectionNote');
    const clear=$('clearSelectionBtn');
    const active=!!(selected||oneUser||state.selectionMessage);
    clear.hidden=!active;
    if(selected){
      const label=DAYS.find(d=>d.i===selected.day)?.label||'';
      const half=selected.half==='matin'?'matin':'après-midi';
      selectionNote.textContent=`${selected.display} — ${label} ${half} : ${participants.size} usager${participants.size>1?'s':''} inscrit${participants.size>1?'s':''} et présent${participants.size>1?'s':''} mis en évidence.`;
    } else if(oneUser){
      selectionNote.textContent=`Usager sélectionné : ${oneUser.name} — toute sa semaine est mise en évidence.`;
    } else selectionNote.textContent=state.selectionMessage||'';
    selectionNote.hidden=!active;
    $('personSelect').value=oneUser?String(oneUser.id):'';
    if(!table)return;
    for(const row of table.tBodies[0]?.rows||[]){
      const uid=Number(row.dataset.user);
      const matchUser=!!oneUser&&uid===oneUser.id;
      const matchActivity=!!selected&&participants.has(uid);
      row.classList.toggle('selected-person',matchUser);
      row.classList.toggle('selected-activity',matchActivity);
      row.querySelector('td.user')?.setAttribute('aria-pressed',String(matchUser));
      row.querySelectorAll('.activity-item').forEach(item=>{
        const td=item.closest('td.activities');
        const hit=!!selected&&matchActivity&&item.dataset.open==='0'&&
          item.dataset.activityName===selected.name&&
          Number(td?.dataset.dayIndex)===selected.day&&td?.dataset.halfValue===selected.half;
        item.classList.toggle('matching-activity',hit);
        item.setAttribute('aria-pressed',String(hit));
      });
    }
  }
  // Petite fiche lisible : position fixe HORS du tableau et hors du PDF.
  // Les coordonnées sont mesurées après le zoom écran de la V9.5.
  function hideParticipantsPopover(){
    state.popoverAnchor=null;
    const box=$('participantsPopover');
    if(box)box.hidden=true;
  }
  function positionParticipantsPopover(){
    const box=$('participantsPopover'),anchor=state.popoverAnchor;
    if(!box||box.hidden||!anchor)return;
    if(!anchor.isConnected){hideParticipantsPopover();return;}
    const rect=anchor.getBoundingClientRect();
    if(rect.bottom<0||rect.top>window.innerHeight||rect.right<0||rect.left>window.innerWidth){
      hideParticipantsPopover();return;
    }
    const margin=10,gap=10,width=box.offsetWidth,height=box.offsetHeight;
    // Privilégier l'affichage à droite de la case ; retourner à gauche si nécessaire.
    let left=rect.right+gap;
    if(left+width>window.innerWidth-margin && rect.left-gap-width>=margin)
      left=rect.left-gap-width;
    left=Math.max(margin,Math.min(left,window.innerWidth-width-margin));
    const top=Math.max(margin,Math.min(rect.top-12,window.innerHeight-height-margin));
    box.style.left=Math.round(left)+'px';
    box.style.top=Math.round(top)+'px';
  }
  function showParticipantsPopover(item){
    const cell=item.closest('td.activities');
    const selection=state.activitySelection;
    const box=$('participantsPopover');
    if(!cell||!selection||!box)return;
    const participants=activityParticipants(selection);
    const people=(state.model?.people||[]).filter(p=>participants.has(p.id));
    const originId=Number(item.closest('tr[data-user]')?.dataset.user);
    const day=DAYS.find(d=>d.i===selection.day)?.label||'';
    const half=selection.half==='matin'?'matin':'après-midi';
    $('participantsTitle').textContent=selection.display;
    $('participantsMeta').textContent=day+' · '+half;
    $('participantsCount').textContent=people.length+
      ' participant'+(people.length>1?'s':'')+' inscrit'+(people.length>1?'s':'');
    const open=item.dataset.open==='1';
    const context=$('participantsContext');
    context.hidden=!open;
    context.textContent=open?'Groupe ouvert proposé à cet usager : il ne s’agit pas d’une inscription confirmée.':'';
    const list=$('participantsList');list.replaceChildren();
    if(!people.length){
      const li=document.createElement('li');li.className='participants-popover-empty';
      li.textContent='Aucune inscription confirmée pour ce créneau.';
      list.append(li);
    }else for(const person of people){
      const li=document.createElement('li');
      li.textContent=person.name; // textContent protège les données Grist.
      li.classList.toggle('is-origin',person.id===originId);
      list.append(li);
    }
    state.popoverAnchor=item;
    box.hidden=false;
    positionParticipantsPopover();
  }
  function clearHighlights(){
    hideParticipantsPopover();
    state.userId=null;state.activitySelection=null;state.selectionMessage='';
    applyHighlights();
  }
  function chooseUser(id){
    if(!state.model?.people.some(p=>p.id===id))return;
    hideParticipantsPopover();
    const wasSelected=state.userId===id&&!state.activitySelection;
    state.userId=wasSelected?null:id;
    state.activitySelection=null;state.selectionMessage='';
    applyHighlights();
  }
  function chooseActivity(item){
    const cell=item.closest('td.activities');
    if(!cell)return;
    const name=item.dataset.activityName;
    const day=Number(cell.dataset.dayIndex),half=cell.dataset.halfValue;
    if(!name||!day||!half)return;
    // Recliquer sur la même activité ferme la liste et annule le surlignage.
    const same=state.activitySelection?.name===name &&
      state.activitySelection?.day===day && state.activitySelection?.half===half &&
      state.popoverAnchor===item;
    hideParticipantsPopover();
    state.userId=null;state.selectionMessage='';
    if(same){state.activitySelection=null;applyHighlights();return;}
    state.activitySelection={name,day,half,display:item.querySelector('.activity-name')?.textContent.replace(/◇/g,'').trim()||name};
    // Même si le libellé est proposé au titre d'un groupe ouvert, seules les
    // inscriptions CONFIRMÉES comptent dans la liste et le surlignage.
    applyHighlights();
    showParticipantsPopover(item);
  }
  function fitCellText(model){
    // Ne jamais agrandir une ligne isolée : le document A3 doit garder un
    // alignement horizontal strict. Signaler tout débordement non résolu.
    for(const wrapper of $('tableHost').querySelectorAll('.events')){
      const names=[...wrapper.querySelectorAll('.activity-name')];
      const staffs=[...wrapper.querySelectorAll('.activity-staff')];
      let factor=1;
      while(wrapper.scrollHeight>wrapper.clientHeight+1 && factor>.65){
        factor=Math.max(.65,+(factor-.03).toFixed(2));
        names.forEach(el=>el.style.fontSize=(6.65*factor).toFixed(2)+'pt');
        staffs.forEach(el=>el.style.fontSize=(5.25*factor).toFixed(2)+'pt');
      }
      if(wrapper.scrollHeight>wrapper.clientHeight+1){
        const cell=wrapper.closest('td');const row=wrapper.closest('tr');
        const index=[...row.cells].indexOf(cell);
        const dayIndex=Math.floor((index-2)/4);
        const halfIndex=Math.floor(((index-2)%4)/2);
        const day=cell?.dataset.day||DAYS[dayIndex]?.label||'jour inconnu';
        const half=cell?.dataset.half||HALVES[halfIndex]?.label||'créneau inconnu';
        const name=row.querySelector('td.user')?.textContent||'Usager inconnu';
        model.errors.push(`Contenu trop long pour une ligne de hauteur uniforme : ${name}, ${day} ${half}.`);
      }
    }
    // Les noms longs (par ex. noms composés) peuvent déclencher un débordement
    // même lorsque les activités tiennent correctement dans leurs cases.
    const nominalRowPx=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-mm'))*96/25.4;
    for(const cell of $('tableHost').querySelectorAll('tbody td.user')){
      const label=cell.querySelector('.user-label');
      let fontPt=8;
      // Ne pas laisser un nom composé agrandir sa ligne : mesurer le TEXTE,
      // car la cellule <td> s'agrandit déjà si le texte comporte trois lignes.
      while(label && (label.scrollWidth>label.clientWidth+1 || label.scrollHeight>nominalRowPx-3) && fontPt>6){
        fontPt=+(Math.max(6,fontPt-.2)).toFixed(2);
        cell.style.fontSize=fontPt+'pt';
      }
      if(label && (label.scrollWidth>label.clientWidth+2 || label.scrollHeight>nominalRowPx-2)){
        model.errors.push(`Nom d'usager trop long pour une ligne de hauteur uniforme : ${cell.textContent}.`);
      }
    }
    // Dans la colonne Kiné/Ortho, réduire très légèrement une heure atypique.
    for(const cell of $('tableHost').querySelectorAll('tbody td.rehab')){
      let fontPt=7;
      while(cell.scrollWidth>cell.clientWidth+2 && fontPt>5.5){
        fontPt=+(fontPt-.25).toFixed(2);
        cell.style.fontSize=fontPt+'pt';
        cell.querySelectorAll('.rehab-entry').forEach(el=>el.style.fontSize=fontPt+'pt');
      }
    }
  }
  function fitScreen(){
    if($('sheet').hidden)return;
    const widthPx=410/25.4*96;
    const view=$('viewport');
    const usable=Math.max(100,view.clientWidth-18);
    const scale=$('viewSelect').value==='actual'?1:Math.min(1,usable/widthPx);
    document.documentElement.style.setProperty('--screen-scale',String(scale));
  }
  function applyPaper(){
    state.paper=$('paperSelect').value==='a4'?'a4':'a3';
    document.body.classList.toggle('paper-a4',state.paper==='a4');
    document.documentElement.style.setProperty('--print-width',state.paper==='a4'?'287mm':'410mm');
    document.documentElement.style.setProperty('--print-height',state.paper==='a4'?'200mm':'287mm');
    let rule=$('pageRule');if(!rule){rule=document.createElement('style');rule.id='pageRule';document.head.append(rule);}
    rule.textContent=`@page { size: ${state.paper.toUpperCase()} landscape; margin: 5mm; }`;
    $('paperNote').textContent=state.paper==='a4'
      ?'A4 paysage : réduction proportionnelle du planning A3 ; vérifier que les textes restent lisibles.'
      :'A3 paysage recommandé. « Créer un PDF » télécharge directement le planning ; « Imprimer » ouvre la fenêtre d’impression.';
  }
  function calculatePrintFit(){
    const sheet=$('sheet');if(sheet.hidden)return 1;
    // La hauteur du document dépend du nombre réel d'activités par demi-journée.
    // Réduire uniformément la feuille pour que son contenu reste sur UNE page.
    const pxPerMm=96/25.4;
    const h=sheet.offsetHeight/pxPerMm;
    const w=sheet.offsetWidth/pxPerMm;
    const fit=Math.min(1, 285.5/Math.max(h,1), 408.5/Math.max(w,1));
    document.documentElement.style.setProperty('--print-scale-a3',fit.toFixed(5));
    // Marge de sécurité supplémentaire sur A4 : sinon la légende
    // peut être rejetée sur une seconde page par Chromium.
    document.documentElement.style.setProperty('--print-scale-a4',(fit*.660).toFixed(5));
    return fit;
  }
  function canPrint(){
    if(!state.model||state.model.errors.length)return false;
    const before=document.documentElement.style.getPropertyValue('--screen-scale');
    document.documentElement.style.setProperty('--screen-scale','1');
    const sheet=$('sheet'),table=$('tableHost').querySelector('table');
    // Dimension réelle de la grille (sans réduction écran). La taille A4 est un A3 réduit.
    const pxPerMm=96/25.4;
    const width=(table?.offsetWidth||0)/pxPerMm,height=sheet.offsetHeight/pxPerMm;
    const fit=calculatePrintFit();
    const problems=[];
    if(width*fit>410.6||height*fit>286.0)problems.push('Le tableau dépasse encore la page A3 après ajustement.');
    if(fit<.72)problems.push('Réduction excessive : impression peu lisible sur une feuille A3.');
    // Détecter exactement où le contenu dépasse, sans masquer l’information.
    // La vérification des en-têtes se fait séparément afin de ne pas attribuer
    // un débordement de titre à un usager.
    for(const row of table?.tBodies[0]?.rows||[]){
      const name=row.querySelector('td.user')?.textContent?.trim()||'Usager inconnu';
      for(const cell of row.cells){
        // Le débordement d'une <td> peut être un simple arrondi de la grille
        // (largeurs des bordures). Mesurer le contenu réellement imprimable,
        // plutôt que les dimensions intrinsèques de la cellule.
        const content=cell.querySelector('.events') || cell;
        const dh=content.scrollHeight-content.clientHeight;
        const dw=content.scrollWidth-content.clientWidth;
        const isEvents=content!==cell;
        const genuine=isEvents ? dh>2 : (cell.classList.contains('user')||cell.classList.contains('rehab'))&&(dh>3||dw>3);
        if(genuine){
          const location=cell.dataset.day
            ? `${cell.dataset.day} ${cell.dataset.half} — ${cell.classList.contains('rehab')?'Kiné/Ortho':'Activités'}`
            :cell.classList.contains('user')?'nom de l’usager':'colonne N°';
          const axis=[dh>2?`hauteur +${Math.ceil(dh)} px`:'',dw>2?`largeur +${Math.ceil(dw)} px`:''].filter(Boolean).join(', ');
          problems.push(`Texte débordant : ${name}, ${location} (${axis}).`);
          if(problems.length>=4)break;
        }
      }
      if(problems.length>=4)break;
    }
    document.documentElement.style.setProperty('--screen-scale',before||'1');
    if(problems.length){warnings([...state.model.errors,...state.model.notes,...problems]);show('Impression suspendue : '+problems.join(' '),true);return false;}
    return true;
  }
  // Export PDF autonome et local : aucune fenêtre d'impression et aucun serveur tiers.
  // Dessin vectoriel : textes, cellules, couleurs et bordures restent nets à l'agrandissement.
  function makePdfBytes(model, format) {
    if (!model?.people?.length) throw new Error('Planning indisponible pour le PDF.');
    const A4 = format === 'a4';
    const pageW = A4 ? 297 : 420;
    const pageH = A4 ? 210 : 297;
    const ptPerMm = 72 / 25.4;
    const logicalW = 410;
    const rowH = Math.max(5.5, Math.min(10.4, 243 / model.people.length));
    const tableTop = 12, headH = 22;
    const tableBottom = tableTop + headH + rowH * model.people.length;
    const totalH = tableBottom + 10;
    const scale = Math.min((pageW - 10) / logicalW, (pageH - 10) / totalH) * 0.998;
    const offsetX = (pageW - logicalW * scale) / 2;
    const offsetY = (pageH - totalH * scale) / 2;
    const commands = [];
    const fnum = v => (Math.round(v * 1000) / 1000).toString();
    const px = v => fnum((offsetX + v * scale) * ptPerMm);
    const py = v => fnum((pageH - offsetY - v * scale) * ptPerMm);
    const pr = v => fnum(v * scale * ptPerMm);
    const color = hex => {
      const h = (hex || '#ffffff').replace('#', '').trim();
      if (h.length === 3) return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16) / 255);
      if (/^[0-9a-f]{6}$/i.test(h)) return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      return [0, 0, 0];
    };
    const rgb = h => color(h).map(fnum).join(' ');
    const box = (x, y, w, h, bg) => {
      commands.push(`${rgb(bg)} rg ${px(x)} ${py(y + h)} ${pr(w)} ${pr(h)} re f`);
    };
    const line = (x, y, x2, y2, width = .18, ink = '#111111') => {
      commands.push(`${rgb(ink)} RG ${pr(width)} w ${px(x)} ${py(y)} m ${px(x2)} ${py(y2)} l S`);
    };
    const frame = (x, y, w, h, width = .5, ink = '#000000') => {
      commands.push(`${rgb(ink)} RG ${pr(width)} w ${px(x)} ${py(y + h)} ${pr(w)} ${pr(h)} re S`);
    };
    const cp1252 = {8364:128, 8218:130, 402:131, 8222:132, 8230:133, 8224:134, 8225:135,
      710:136, 8240:137, 352:138, 8249:139, 338:140, 381:142, 8216:145, 8217:146,
      8220:147, 8221:148, 8226:149, 8211:150, 8212:151, 732:152, 8482:153,
      353:154, 8250:155, 339:156, 382:158, 376:159, 160:32};
    const pdfStr = value => {
      // Latin occidental adapté aux polices Helvetica standards du PDF.
      const input = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[⋅•]/g, '·');
      let output = '';
      for (const char of input) {
        const n = char.codePointAt(0);
        const b = cp1252[n] ?? (n >= 32 && n <= 255 ? n : 63);
        if (b === 40 || b === 41 || b === 92) output += '\\';
        output += String.fromCharCode(b);
      }
      return output;
    };
    // Mesure réelle des libellés sur canvas, pour un calage au plus proche d'Arial.
    const canvas = document.createElement('canvas');
    const c = canvas.getContext('2d');
    function widthMm(s, fs, bold = false) {
      c.font = `${bold ? '700 ' : ''}${fs * 96 / 72}px Arial, Helvetica, sans-serif`;
      return c.measureText(String(s)).width * 25.4 / 96;
    }
    function splitLines(s, fs, maxW, bold = false) {
      const words = String(s ?? '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [''];
      const lines = [];
      let current = '';
      for (const word of words) {
        if (current && widthMm(current + ' ' + word, fs, bold) <= maxW) { current += ' ' + word; continue; }
        if (current) { lines.push(current); current = ''; }
        if (widthMm(word, fs, bold) <= maxW) { current = word; continue; }
        let part = '';
        for (const letter of word) {
          if (part && widthMm(part + letter, fs, bold) > maxW) { lines.push(part); part = letter; }
          else part += letter;
        }
        current = part;
      }
      if (current) lines.push(current);
      return lines;
    }
    function write(s, x, y, fs = 7, bold = false, ink = '#111111', align = 'left') {
      const txt = pdfStr(s);
      const xFinal = align === 'center' ? x - widthMm(s, fs, bold) / 2 :
        align === 'right' ? x - widthMm(s, fs, bold) : x;
      // y est le HAUT du texte, et la position de base est ajustée pour Helvetica.
      const baseline = y + fs * .80 / ptPerMm;
      commands.push(`BT /${bold ? 'F2' : 'F1'} ${fnum(fs * scale)} Tf ${rgb(ink)} rg 1 0 0 1 ${px(xFinal)} ${py(baseline)} Tm (${txt}) Tj ET`);
    }
    function center(s, x, y, w, h, fs = 7, bold = false, ink = '#111111') {
      write(s, x + w / 2, y + h / 2 - fs / ptPerMm * .51, fs, bold, ink, 'center');
    }
    function diamond(x, y, size = 1.0, ink = '#344f70') {
      commands.push(`${rgb(ink)} RG ${pr(.18)} w ${px(x)} ${py(y - size / 2)} m ${px(x + size / 2)} ${py(y)} l ${px(x)} ${py(y + size / 2)} l ${px(x - size / 2)} ${py(y)} l h S`);
    }
    function textBlock(raw, x, y, w, h, fs, bold = false, ink = '#111111', maxLines = 3, minFs = fs) {
      let sz = fs, parts = [];
      const content = String(raw || '');
      while (sz >= minFs - 0.01) {
        parts = splitLines(content, sz, w, bold);
        const lh = sz * 1.07 / ptPerMm;
        if (parts.length <= maxLines && parts.length * lh <= h) break;
        sz = +(sz - .25).toFixed(2);
      }
      if (sz < minFs) sz = minFs;
      parts = splitLines(content, sz, w, bold);
      const lineH = sz * 1.06 / ptPerMm;
      const fitCount = Math.min(maxLines, Math.floor(h / Math.max(lineH, .1)));
      const display = parts.slice(0, Math.max(1, fitCount));
      if (display.length < parts.length) {
        const last = display.length - 1;
        while (display[last]?.length && widthMm(display[last] + '…', sz, bold) > w) display[last] = display[last].slice(0, -1);
        display[last] += '…';
      }
      const yStart = y + Math.max(0, (h - display.length * lineH) / 2);
      display.forEach((txt, i) => write(txt, x, yStart + i * lineH, sz, bold, ink));
    }
    function cellEvents(activities, x, y, w, h) {
      const list = (activities || []).slice(0, 2);
      if (!list.length) return;
      let namePt = 6.6, staffPt = 5.1;
      let segments;
      for (let tries = 0; tries < 10; tries++) {
        segments = [];
        for (const item of list) {
          const label = isFree(item.name) ? 'Temps libre' : item.name;
          const nameLines = splitLines(label, namePt, w - 1.1 - (item.open ? 1.7 : 0), true);
          nameLines.forEach((v, index) => segments.push({value:v, size:namePt, bold:true, open:item.open && index===nameLines.length-1}));
          if (item.staff && !noStaff(item.name) && !isFree(item.name)) {
            splitLines(item.staff, staffPt, w - 1.1, false).forEach(v => segments.push({value:v, size:staffPt, bold:false}));
          }
        }
        const height = segments.reduce((sum, p) => sum + p.size * 1.09 / ptPerMm, 0);
        if (height <= h - .7 || namePt <= 4.8) break;
        namePt = +(namePt - .2).toFixed(2);
        staffPt = +(Math.max(4, staffPt - .18)).toFixed(2);
      }
      let height = segments.reduce((sum, p) => sum + p.size * 1.09 / ptPerMm, 0);
      let top = y + Math.max(.25, (h - height) / 2);
      for (const item of segments) {
        const lineHeight = item.size * 1.09 / ptPerMm;
        if (top + lineHeight > y + h - .2) break;
        write(item.value, x + .45, top, item.size, item.bold);
        if (item.open) {
          const end = x + .45 + widthMm(item.value, item.size, true) + .8;
          if (end + .6 < x + w) diamond(end, top + lineHeight * .48, .85);
        }
        top += lineHeight;
      }
    }
    // Bandeau de titre, 7 couleurs de jours identiques à celles du planning.
    box(0, 0, 410, 12, '#10365f');
    const yr = fullSchoolYear(model.year.Annee);
    center(`Planning SAJ Anagallis   ${yr}`, 0, 0, 410, 12, 16, true, '#ffffff');
    const numW = 7, userW = 35, dayX0 = numW + userW, dayW = 73.6;
    const actW = 29.3, rehabW = 7.5, halfW = actW + rehabW;
    box(0, 12, numW, 22, '#dceaf7');
    box(numW, 12, userW, 22, '#dceaf7');
    center('N°', 0, 12, numW, 22, 9, true, '#172c44');
    center('Usagers', numW, 12, userW, 22, 10, true, '#172c44');
    for (let di = 0; di < 5; di++) {
      const d = DAYS[di], x = dayX0 + di * dayW;
      box(x, 12, dayW, 8, dayColor(d));
      center(d.label, x, 12, dayW, 8, 11, true, '#ffffff');
      for (let hi = 0; hi < 2; hi++) {
        const hx = x + hi * halfW;
        box(hx, 20, halfW, 7, '#eef2f5');
        center(HALVES[hi].label, hx, 20, halfW, 7, 8.5, true);
        box(hx, 27, actW, 7, '#eaf2fa');
        box(hx + actW, 27, rehabW, 7, '#7846b8');
        center('Activités', hx, 27, actW, 7, 6.8, true);
        center('Kiné /', hx + actW, 28, rehabW, 3, 5.5, true, '#ffffff');
        center('Ortho', hx + actW, 31, rehabW, 3, 5.5, true, '#ffffff');
      }
    }
    // Grille de données par usager, hauteur uniforme et absences sur journée.
    for (let ri = 0; ri < model.people.length; ri++) {
      const p = model.people[ri], y = 34 + ri * rowH;
      const base = ri % 2 ? '#dff2ff' : '#ffffff';
      box(0, y, numW, rowH, base);
      box(numW, y, userW, rowH, base);
      center(String(ri + 1), 0, y, numW, rowH, 8, true);
      textBlock(p.name, numW + .9, y + .25, userW - 1.8, rowH - .5, 8, true, '#111111', 3, 6);
      for (let di = 0; di < 5; di++) {
        const d = DAYS[di], x = dayX0 + di * dayW;
        if (p.flags?.[di] === false) {
          box(x, y, dayW, rowH, '#ffb64f');
          center('Absent', x, y, dayW, rowH, 9, true);
        } else {
          for (let hi = 0; hi < 2; hi++) {
            const half = HALVES[hi], xx = x + hi * halfW;
            box(xx, y, actW, rowH, base);
            box(xx + actW, y, rehabW, rowH, '#e9def6');
            const record = model.cells.get(`${p.id}|${d.i}|${half.value}`);
            cellEvents(record?.activities || [], xx, y, actW, rowH);
            const appts = record?.rehab || [];
            if (appts.length) {
              const hours = appts.map(v => String(v.hour || '')).filter(Boolean);
              const fz = 6.9, lh = fz * 1.15 / ptPerMm;
              let yy = y + Math.max(.3, (rowH - hours.length * lh) / 2);
              for (const hour of hours) {
                write(hour, xx + actW + rehabW / 2, yy, fz, true, '#111111', 'center');
                yy += lh;
              }
            }
          }
        }
      }
      line(0, y + rowH, 410, y + rowH, (ri + 1) % 3 === 0 ? .4 : .17);
    }
    // Colonnes : trait gauche N°, N°/Usagers, blocs jours et sous-colonnes.
    line(0, 12, 0, tableBottom, .66);
    line(numW, 12, numW, tableBottom, .6);
    line(dayX0, 12, dayX0, tableBottom, .66);
    for (let di = 0; di < 5; di++) {
      const x = dayX0 + di * dayW;
      if (di) line(x, 12, x, tableBottom, .65);
      for (let hi = 0; hi < 2; hi++) {
        const hx = x + hi * halfW;
        if (hi) line(hx, 20, hx, 34, .25);
        line(hx + actW, 27, hx + actW, 34, .17);
        // Des sous-colonnes sont masquées les jours où l'usager est absent.
        for (let ri = 0; ri < model.people.length; ri++) {
          const y = 34 + ri * rowH;
          if (model.people[ri].flags?.[di] === false) continue;
          if (hi) line(hx, y, hx, y + rowH, .3);
          line(hx + actW, y, hx + actW, y + rowH, .17);
        }
      }
    }
    line(410, 12, 410, tableBottom, .66);
    line(0, 12, 410, 12, .55);
    line(0, 34, 410, 34, .66);
    line(0, tableBottom, 410, tableBottom, .5);
    for (let di = 0; di < 5; di++) {
      const x = dayX0 + di * dayW;
      line(x, 20, x + dayW, 20, .16);
      line(x, 27, x + dayW, 27, .16);
    }
    // Légende et pied de page sans bandeaux inutiles.
    const footY = tableBottom + 2.0;
    write('Temps libre : uniquement si inscrit', 2, footY, 7.2);
    diamond(91, footY + 1.0, 1.35);
    write('groupe ouvert proposé', 93.5, footY, 7.2);
    box(169, footY + .3, 3.8, 2.8, '#7846b8');
    frame(169, footY + .3, 3.8, 2.8, .12);
    write('Kiné / Ortho (début du RDV)', 175, footY, 7.2);
    box(268, footY + .3, 3.8, 2.8, '#ffb64f');
    frame(268, footY + .3, 3.8, 2.8, .12);
    write('Absent (journée)', 274, footY, 7.2);
    write(`SAJ Anagallis · ${yr}`, 2, tableBottom + 6.5, 6.2, false, '#445566');
    const stamp = new Intl.DateTimeFormat('fr-FR').format(new Date());
    write(`Édité le ${stamp}`, 408, tableBottom + 6.5, 6.2, false, '#445566', 'right');
    // Construction minimale et valide du PDF 1.4 : 1 page, 2 polices vectorielles.
    const wpt = fnum(pageW * ptPerMm), hpt = fnum(pageH * ptPerMm);
    const stream = commands.join('\n') + '\n';
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wpt} ${hpt}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];
    let pdf = '%PDF-1.4\n%\xE9\xF1\xE8\xF5\n';
    const offsets = [0];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const startXref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return bytes;
  }
  function downloadPdf() {
    if (!canPrint()) return;
    applyPaper();
    const button = $('pdfBtn');
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Création du PDF…';
    try {
      const bytes = makePdfBytes(state.model, state.paper);
      const blob = new Blob([bytes], {type:'application/pdf'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const year = fullSchoolYear(state.model.year.Annee).replace(/[^\d-]/g, '-');
      a.href = url;
      a.download = `Planning_SAJ_Anagallis_${year}_${state.paper.toUpperCase()}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      show(`Téléchargement du fichier PDF ${state.paper.toUpperCase()} lancé. Vérifie le dossier Téléchargements du navigateur.`);
    } catch (err) {
      console.error('Création PDF', err);
      show(`Impossible de créer le PDF : ${err?.message || String(err)}`, true);
    } finally {
      button.textContent = previous;
      button.disabled = false;
    }
  }

  function doPrint(){
    if(!canPrint())return;
    applyPaper();
    document.title=`Planning_SAJ_Anagallis_${text(state.model.year.Annee).replace(/[^\w-]+/g,'-')}_${state.paper.toUpperCase()}`;
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR').format(new Date());
    window.print();
  }
  function bind(){
    $('yearSelect').addEventListener('change',e=>{state.yearId=Number(e.target.value);clearHighlights();render();});
    $('personSelect').addEventListener('change',e=>{
      hideParticipantsPopover();
      state.userId=Number(e.target.value)||null;
      state.activitySelection=null;state.selectionMessage='';applyHighlights();
    });
    $('clearSelectionBtn').addEventListener('click',clearHighlights);
    $('participantsClose').addEventListener('click',clearHighlights);
    // Fermeture au clic en dehors ; ne pas modifier la sélection d'un usager.
    document.addEventListener('click',e=>{
      if($('participantsPopover').hidden)return;
      if(e.target.closest('#participantsPopover')||e.target.closest('.activity-item'))return;
      if(state.activitySelection)clearHighlights();
      else hideParticipantsPopover();
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!$('participantsPopover').hidden){
        e.preventDefault();clearHighlights();
      }
    });
    $('paperSelect').addEventListener('change',applyPaper);
    $('viewSelect').addEventListener('change',fitScreen);
    $('refreshBtn').addEventListener('click',load);
    $('printBtn').addEventListener('click',doPrint);
    $('pdfBtn').addEventListener('click',downloadPdf);
    $('tableHost').addEventListener('click',e=>{
      const item=e.target.closest('.activity-item');
      if(item){chooseActivity(item);return;}
      const row=e.target.closest('tr[data-user]');
      if(row)chooseUser(Number(row.dataset.user));
    });
    // Clavier : les activités et noms d'usagers se sélectionnent aussi avec
    // Entrée/Espace. Aucun surlignage n'est déclenché par le survol.
    $('tableHost').addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const item=e.target.closest('.activity-item');
      if(item){e.preventDefault();chooseActivity(item);return;}
      const user=e.target.closest('td.user');
      if(user){e.preventDefault();chooseUser(Number(user.closest('tr[data-user]')?.dataset.user));}
    });
    window.addEventListener('resize',()=>{fitScreen();positionParticipantsPopover();});
    window.addEventListener('scroll',positionParticipantsPopover,true);
    $('viewport').addEventListener('scroll',positionParticipantsPopover);
    $('viewSelect').addEventListener('change',()=>{
      // Le zoom peut modifier la position géométrique de l'élément ciblé.
      requestAnimationFrame(positionParticipantsPopover);
    });
    if(typeof ResizeObserver==='function')new ResizeObserver(fitScreen).observe($('viewport'));
  }
  async function start(){
    bind();applyPaper();
    if(!window.grist){show('Ouvrir ce widget dans Grist pour accéder aux données.',true);return;}
    grist.ready({requiredAccess:'full'});
    if(typeof grist.onRecords==='function')grist.onRecords(()=>{
      clearTimeout(state.refreshTimer);state.refreshTimer=setTimeout(load,350);
    });
    await load();
  }
  start().catch(e=>{console.error(e);show(e.message||String(e),true);});
})();
