/*
 * Planning général SAJ Anagallis V4 — lecture seule, données Grist.
 * Une grande case « Activités » par usager et demi-journée ; toutes les
 * activités INSCRITES y sont listées. Deux autres cases : Kiné/Ortho, Référence.
 * Aucun « X », aucune participation déduite, aucun horaire d'activité imprimé.
 * Export A3/A4 via fenêtre d'impression native (PDF local, sans service tiers).
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
    loaded:false,loading:false,paper:'a3',model:null,refreshTimer:null};
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
  function simpleHour(v){
    const m=text(v).match(/\b(\d{1,2})\s*[h:]\s*(\d{1,2})?/i);
    return m?`${+m[1]}h${m[2]&&+m[2]?String(+m[2]).padStart(2,'0'):''}`:'';
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
  const isReference=s=>/\btemps (?:de )?(?:reference|referent|ref)\b/.test(norm(s));
  const isRehab=s=>/\bkine\b|\bkinesitherap|\bortho\b|orthophon/.test(norm(s));
  const noStaff=s=>['accueil','nul bar ailleurs','nulle part ailleurs'].includes(norm(s));
  function statusKind(s){
    const v=norm(s);
    if(/\bsaj\b/.test(v))return 'saj';
    if(/\bltc\b|\bintervenant\b|\bodyneo\b|\bbenevole\b/.test(v))return 'external';
    return 'unknown';
  }
  function fullName(p){return text(p?.Nom2)||[text(p?.Prenom),text(p?.Nom)].filter(Boolean).join(' ');}
  function staffFor(a,staffByName,notes){
    const refIds=refs(a.Animateur_s);
    const fromIds=refIds.map(id=>state.byId.animators.get(id)).filter(Boolean);
    const knownNames=names(a.gristHelper_Display).concat(names(a.Animateur_s2));
    const resolved=fromIds.length?fromIds:[];
    for(const written of knownNames){
      // Nom affiché par Grist : essayer de le rapprocher d'un vrai animateur
      // pour retrouver son statut sans l'inventer.
      const entry=staffByName.get(norm(written));
      if(entry&&!resolved.some(x=>x.id===entry.id))resolved.push(entry);
    }
    const unresolvedIds=refIds.filter(id=>!state.byId.animators.has(id));
    const display=unique([...resolved.map(fullName),...knownNames.filter(n=>!resolved.some(p=>norm(fullName(p))===norm(n)))]);
    if(!display.length&&!noStaff(a.Nom_activite)&&!isFree(a.Nom_activite)&&!isReference(a.Nom_activite))
      notes.push(`Animateur non retrouvé : ${text(a.Nom_activite)} (vérifier Activites.Animateur_s).`);
    if(unresolvedIds.length)notes.push(`Référence animateur introuvable pour : ${text(a.Nom_activite)}.`);
    const status=resolved.map(x=>statusKind(x.Status));
    const category=status.includes('saj')?'saj':status.includes('external')&&status.every(s=>s==='external')?'external':noStaff(a.Nom_activite)?'saj':'unknown';
    if(category==='unknown'&&!isFree(a.Nom_activite)&&!isReference(a.Nom_activite))
      notes.push(`Statut à confirmer : ${text(a.Nom_activite)} (ni SAJ ni extérieur déduit automatiquement).`);
    return {staff:display.join(' · '),category};
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
    const animatorByName=new Map();
    for(const s of state.raw.animators){for(const label of [fullName(s),`${text(s.Nom)} ${text(s.Prenom)}`])if(label)animatorByName.set(norm(label),s);}
    const cells=new Map();
    function bucket(userId,day,half){const key=`${userId}|${day}|${half}`;if(!cells.has(key))cells.set(key,{activities:[],rehab:[],reference:[]});return cells.get(key);}
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
      const staff=(specialFree||specialRef)?{staff:'',category:'saj'}:staffFor(a,animatorByName,notes);
      const item={id:actId,name:text(a.Nom_activite)||'Activité',sort:Number.isFinite(minutes(start))?minutes(start):9999,
        category:specialFree?'free':staff.category,staff:staff.staff};
      for(const userId of participants){
        if(!peopleById.has(userId)){notes.push(`Participant ${userId} introuvable pour ${item.name}.`);continue;}
        const entry=bucket(userId,day,half);
        if(specialRef)entry.reference.push(item.name);
        else entry.activities.push(item);
      }
      activityCount++;
    }
    for(const [key,entry] of cells){
      entry.activities.sort((a,b)=>a.sort-b.sort||a.name.localeCompare(b.name,'fr'));
      entry.reference=unique(entry.reference);
    }
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
          if(b&&(b.activities.length||b.rehab.length||b.reference.length))notes.push(`Données planifiées un jour d’absence : ${p.name}, ${d.label}.`);
        }
      }
    }}
    const maxEntries=Math.max(0,...[...cells.values()].map(x=>x.activities.length));
    if(maxEntries>=4)notes.push(`Une demi-journée comporte jusqu'à ${maxEntries} activités pour un usager : vérifier la lisibilité sur A4.`);
    return {year,people,cells,errors,notes:unique(notes),activityCount,rehabCount,maxEntries};
  }
  function renderEvent(event){
    const type=event.category;
    const showStaff=!noStaff(event.name)&&type!=='free'&&!!event.staff;
    return `<div class="activity-item ${esc(type==='saj'?'':type)}" title="${esc(event.name+(showStaff?' — '+event.staff:''))}">
      <span class="activity-name">${esc(type==='free'?'Temps libre':event.name)}</span>
      ${showStaff?`<span class="activity-staff">${esc(event.staff)}</span>`:''}
    </div>`;
  }
  function cellsFor(person,day,half){
    const halfStart=half.value==='matin'?'day-start':'half-start';
    const b=state.model.cells.get(`${person.id}|${day.i}|${half.value}`)||{activities:[],rehab:[],reference:[]};
    const acts=b.activities.map(renderEvent).join('');
    const kine=b.rehab.map(e=>`<span class="rehab-entry" title="${esc(e.kind+' '+e.hour)}">${esc(e.hour)}</span>`).join('');
    // Les temps de référence ne sont JAMAIS déduits ; seulement explicitement inscrits.
    const refs=b.reference.length?'R':''; // Format court : colonne de 3,5 mm, sans débordement
    return `<td class="activities ${halfStart}"><div class="events">${acts}</div></td>
      <td class="rehab" title="${esc(b.rehab.map(x=>x.kind+' '+x.hour).join(' / '))}">${kine}</td>
      <td class="reference" title="${esc(b.reference.join(' · '))}">${refs}</td>`;
  }
  function render(){
    if(!state.loaded)return;
    const model=modelForYear();state.model=model;
    if(!model.year){$('sheet').hidden=true;show('Aucune année',true);warnings(model.errors);return;}
    fillUsers(model.people);
    $('titleYear').textContent=text(model.year.Annee);
    $('footerYear').textContent='SAJ Anagallis · '+text(model.year.Annee);
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR').format(new Date());
    // A3 : hauteur disponible 287 mm moins les en-têtes, la légende et les marges.
    const minRow=5.5,maxRow=10.4,usableRows=243;
    const target=model.people.length?Math.min(maxRow,usableRows/model.people.length):maxRow;
    document.documentElement.style.setProperty('--row-mm',`${Math.max(minRow,target).toFixed(2)}mm`);
    if(model.people.length&&target<minRow)model.errors.push('Nombre d’usagers trop élevé pour garder des cases lisibles sur une page A3.');
    const dayHeads=DAYS.map(d=>`<th colspan="6" class="day-label day-start" style="background:${dayColor(d)}">${esc(d.label)}</th>`).join('');
    const periodHeads=DAYS.map(d=>HALVES.map(h=>`<th colspan="3" class="half-label ${h.value==='matin'?'day-start':'half-start'}">${esc(h.label)}</th>`).join('')).join('');
    const types=DAYS.map(d=>HALVES.map(h=>`<th class="type-label ${h.value==='matin'?'day-start':'half-start'}">Activités</th><th class="type-label rehab-header">Kiné / Ortho</th><th class="type-label ref-header">Temps de réf.</th>`).join('')).join('');
    const body=model.people.map((p,i)=>{
      let tds='';
      for(const d of DAYS){
        if(p.flags?.[d.i-1]===false)tds+='<td class="absent day-start" colspan="6">Absent</td>';
        else for(const h of HALVES)tds+=cellsFor(p,d,h);
      }
      return `<tr data-user="${p.id}" class="${p.id===state.userId?'selected':''}"><td class="identity number">${i+1}</td><td class="identity user" title="${esc(p.name)}">${esc(p.name)}</td>${tds}</tr>`;
    }).join('');
    const html=`<table class="planning" aria-label="Planning général SAJ Anagallis"><colgroup>
      <col style="width:7mm"><col style="width:34mm">${Array.from({length:10},()=>'<col style="width:25.7mm"><col style="width:7.7mm"><col style="width:3.5mm">').join('')}</colgroup>
      <thead><tr><th rowspan="3" class="num-col">N°</th><th rowspan="3" class="name-col">Usagers</th>${dayHeads}</tr>
      <tr>${periodHeads}</tr><tr>${types}</tr></thead><tbody>${body}</tbody></table>`;
    $('tableHost').innerHTML=html;$('sheet').hidden=false;
    warnings([...model.errors,...model.notes]);
    const ok=model.people.length>0&&!model.errors.length;
    $('printBtn').disabled=!ok;$('pdfBtn').disabled=!ok;
    show(`${model.people.length} usagers · ${model.activityCount} activités enregistrées · ${model.rehabCount} rendez-vous kiné/ortho. ${ok?'Planning prêt à être vérifié et imprimé.':'Vérifier les problèmes signalés avant impression.'}`,!ok);
    fitScreen();
    calculatePrintFit();
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
      :'A3 paysage recommandé. Pour le PDF, choisir « Enregistrer au format PDF » et activer les arrière-plans.';
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
    document.documentElement.style.setProperty('--print-scale-a4',(fit*.695).toFixed(5));
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
    // Détecter une activité ou un rendez-vous qui dépasse le contenu de sa ligne.
    for(const row of table?.tBodies[0]?.rows||[]){
      for(const cell of row.cells){
        if(cell.scrollHeight>cell.clientHeight+2||cell.scrollWidth>cell.clientWidth+2){
          problems.push('Au moins une case est trop petite pour tout son contenu.');break;
        }
      }
      if(problems.length)break;
    }
    document.documentElement.style.setProperty('--screen-scale',before||'1');
    if(problems.length){warnings([...state.model.errors,...state.model.notes,...problems]);show('Impression suspendue : '+problems.join(' '),true);return false;}
    return true;
  }
  function doPrint(asPdf){
    if(!canPrint())return;
    applyPaper();
    document.title=`Planning_SAJ_Anagallis_${text(state.model.year.Annee).replace(/[^\w-]+/g,'-')}_${state.paper.toUpperCase()}`;
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR').format(new Date());
    if(asPdf)show(`Pour sauvegarder : destination « Enregistrer au format PDF », format ${state.paper.toUpperCase()}, orientation paysage, arrière-plans activés.`);
    window.print();
  }
  function bind(){
    $('yearSelect').addEventListener('change',e=>{state.yearId=Number(e.target.value);render();});
    $('personSelect').addEventListener('change',e=>{state.userId=Number(e.target.value)||null;render();});
    $('paperSelect').addEventListener('change',applyPaper);
    $('viewSelect').addEventListener('change',fitScreen);
    $('refreshBtn').addEventListener('click',load);
    $('printBtn').addEventListener('click',()=>doPrint(false));
    $('pdfBtn').addEventListener('click',()=>doPrint(true));
    $('tableHost').addEventListener('click',e=>{
      const row=e.target.closest('tr[data-user]');if(!row)return;
      state.userId=Number(row.dataset.user);$('personSelect').value=String(state.userId);
      $('tableHost').querySelectorAll('tbody tr').forEach(el=>el.classList.toggle('selected',el===row));
    });
    window.addEventListener('resize',fitScreen);
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
