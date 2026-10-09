/*
  SAJ Anagallis — planning collectif annuel A3 / A4 (lecture seule).
  Schéma vérifié sur l'export .grist reçu : 16 tables métier, 0 enregistrement.
  Dépendances : API officielle des widgets Grist. Aucune bibliothèque PDF tierce.
  IMPORTANT : le PDF est généré localement via l'impression du navigateur.
*/
(() => {
  'use strict';

  const TABLES = {
    users: 'Usagers', years: 'Annees', activities: 'Activites',
    participations: 'Participations', animators: 'Animateurs',
    days: 'Jours_de_la_semaine', hours: 'Heures',
    reeducations: 'Reeducations', reeducationTypes: 'Activites_autres',
    forecasts: 'Planning_previsionnel', annualPresence: 'Presences_annuelles'
  };
  const REQUIRED = ['users','years','activities','participations','animators','days','hours','reeducations','reeducationTypes'];
  const DAYS = [
    {i:1,name:'Lundi',short:'Lu',fallback:'#1d9fdf'},
    {i:2,name:'Mardi',short:'Ma',fallback:'#25b243'},
    {i:3,name:'Mercredi',short:'Me',fallback:'#be54d8'},
    {i:4,name:'Jeudi',short:'Je',fallback:'#efac23'},
    {i:5,name:'Vendredi',short:'Ve',fallback:'#d3515a'}
  ];
  const PERIODS = ['matin', 'apres-midi'];
  const PERIOD_CUTOFF_MIN = 12 * 60 + 30;
  const PRINT = {
    usableWidth: 410, indexWidth: 6, userWidth: 34,
    rehabWidth: 9.2, referenceWidth: 4.4, freeWidth: 4.4,
    minActivityWidth: 2.8, maxActivityWidth: 6.0,
    usableHeight: 287, fixedHeight: 109, minRowHeight: 4.4, maxRowHeight: 7.0
  };

  const state = {
    raw: {}, byId: {}, tableColumns: {}, tablesExisting: [], selectedYearId: null,
    currentYearId: null, selectedUserId: null, model: null, paper: 'a3',
    refreshTimer: null, loading: false, loaded: false
  };
  const $ = id => document.getElementById(id);
  const toText = value => value === null || value === undefined ? '' : String(value).trim();
  const escapeHtml = value => toText(value).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const stripAccents = value => toText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const normalize = value => stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const truthy = value => value === true || value === 1 || value === '1' || normalize(value) === 'true';

  function decode(value) {
    try {
      if (window.grist && typeof grist.decodeObject === 'function') return grist.decodeObject(value);
    } catch (_) { /* conserver la valeur originale */ }
    return value;
  }
  function ids(value) {
    let v = decode(value);
    if (typeof v === 'string' && v.startsWith('[')) {
      try { v = JSON.parse(v); } catch (_) { /* ignorer */ }
    }
    if (Array.isArray(v)) {
      if (v[0] === 'L') return v.slice(1).map(Number).filter(Number.isFinite);
      if (v[0] === 'l') return v.slice(1).map(Number).filter(Number.isFinite);
      return v.map(Number).filter(x => Number.isFinite(x) && x > 0);
    }
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  }
  const firstId = value => ids(value)[0] || 0;
  function rowsFromTable(table) {
    if (!table || !Array.isArray(table.id)) return [];
    return table.id.map((id,i) => {
      const row = {id:Number(id)};
      for (const [column, values] of Object.entries(table)) {
        if (Array.isArray(values)) row[column] = decode(values[i]);
      }
      return row;
    });
  }
  function timeText(value) {
    const n = firstId(value);
    const time = state.byId.hours?.get(n)?.Heures;
    return toText(time || (typeof value === 'string' && !n ? value : ''));
  }
  function minuteOf(text) {
    const s = normalize(toText(text).replace(/:/g,'h'));
    const match = s.match(/\b(\d{1,2})\s*h\s*(\d{1,2})?\b/);
    if (match) return Number(match[1])*60 + Number(match[2]||0);
    const only = s.match(/^\d{1,2}$/);
    return only ? Number(s)*60 : Number.NaN;
  }
  function compactTime(value) {
    const original = toText(value);
    const first = original.split(/\s*(?:-|–|—|\ba\b|\bà\b)\s*/i)[0].trim();
    const match = first.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?$/i);
    if (match) {
      const hh = String(Number(match[1]));
      const mm = (match[2]||'').padStart(2,'0');
      return !match[2] || mm==='00' ? `${hh}h` : `${hh}h${mm}`;
    }
    return first || '?';
  }
  function periodFromTime(timeValue) {
    const min = minuteOf(timeValue);
    return Number.isFinite(min) ? (min < PERIOD_CUTOFF_MIN ? 'matin':'apres-midi') : null;
  }
  function getDay(refValue, fallback) {
    const d = state.byId.days?.get(firstId(refValue));
    const fromRef = Number(d?.Num_jour);
    if (fromRef >= 1 && fromRef <= 5) return fromRef;
    const fromFallback = Number(fallback);
    return fromFallback >= 1 && fromFallback <= 5 ? fromFallback : 0;
  }
  function colorOfDay(dayNumber) {
    const d = DAYS[dayNumber-1];
    const row = (state.raw.days||[]).find(x => Number(x.Num_jour) === dayNumber);
    const color = toText(row?.Couleur);
    // N'autoriser que les couleurs statiques ; jamais des propriétés CSS arbitraires.
    const safe = /^(#[a-f\d]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i.test(color);
    return safe ? color : d.fallback;
  }
  const isFree = name => /\btemps libres?\b|\btemps perso(?:nnel)?\b|^libre$/.test(normalize(name));
  const isReference = name => /\btemps (?:de )?(?:reference|referent|ref)\b/.test(normalize(name));
  const isRehab = name => /\bkine\b|\bkinesitherap/i.test(normalize(name)) || /\bortho\b|orthophon/i.test(normalize(name));

  function showStatus(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }
  function warningPanel(warnings) {
    const ul = $('warnings');
    ul.innerHTML = '';
    const deduped = [...new Set(warnings)].filter(Boolean);
    for (const w of deduped) {
      const li=document.createElement('li'); li.textContent = w; ul.append(li);
    }
    ul.hidden = !deduped.length;
  }
  function populateYear() {
    const el = $('yearSelect');
    const years = [...state.raw.years].sort((a,b) =>
      Number(b.Debut||0)-Number(a.Debut||0) || toText(b.Annee).localeCompare(toText(a.Annee),'fr',{numeric:true}));
    state.currentYearId = Number(years.find(x=>normalize(x.Etat)==='actuel')?.id)||null;
    if (!years.some(x=>x.id===Number(state.selectedYearId))) state.selectedYearId = state.currentYearId || years[0]?.id || null;
    el.replaceChildren();
    for (const y of years) {
      const o = document.createElement('option'); o.value=y.id;
      o.textContent = `${toText(y.Annee)||'Année '+y.id}${normalize(y.Etat)==='actuel'?' (actuel)':''}`;
      el.append(o);
    }
    el.value=state.selectedYearId||'';
    el.disabled=!years.length;
  }
  function populatePerson(people) {
    const el=$('personSelect');
    if (!people.some(x=>x.id===Number(state.selectedUserId))) state.selectedUserId=null;
    el.innerHTML='<option value="">Tous les usagers</option>';
    for (const user of people) {
      const o=document.createElement('option'); o.value=user.id; o.textContent=user.name; el.append(o);
    }
    el.value=state.selectedUserId||'';
    el.disabled=!people.length;
  }

  async function loadData() {
    if (state.loading) return;
    state.loading=true;
    $('refreshBtn').disabled=true;
    $('printBtn').disabled=true;
    $('pdfBtn').disabled=true;
    showStatus('Lecture des tables Grist…');
    try {
      if (!window.grist || !grist.docApi) throw new Error('Ouvre le widget dans Grist et autorise l’accès complet au document.');
      const allTables = await grist.docApi.listTables();
      state.tablesExisting = allTables;
      const absent = REQUIRED.filter(k => !allTables.includes(TABLES[k]));
      if (absent.length) throw new Error('Tables obligatoires manquantes : '+absent.map(k=>TABLES[k]).join(', '));
      const raw={}, byId={}, tableColumns={};
      await Promise.all(Object.entries(TABLES).map(async ([key,name]) => {
        if (!allTables.includes(name)) { raw[key]=[]; byId[key]=new Map(); tableColumns[key]=[]; return; }
        const table = await grist.docApi.fetchTable(name);
        tableColumns[key]=Object.keys(table || {});
        const rows=rowsFromTable(table);
        raw[key]=rows; byId[key]=new Map(rows.map(x=>[x.id,x]));
      }));
      state.raw=raw; state.byId=byId; state.tableColumns=tableColumns;
      state.loaded=true;
      populateYear();
      render();
    } catch(error) {
      console.error(error);
      state.loaded=false;
      $('sheet').hidden=true;
      showStatus(`Impossible de charger le planning : ${error?.message||error}`,true);
      warningPanel([]);
    } finally {
      state.loading=false;
      $('refreshBtn').disabled=false;
    }
  }

  function createModel() {
    const yearId=Number(state.selectedYearId);
    const year=state.byId.years.get(yearId);
    const notes=[], problems=[];
    if (!year) return {year:null,people:[],days:[],notes:['Aucune année disponible.'],problems:['Année absente.']};
    const isCurrent=Number(state.currentYearId)===yearId;
    const forecast=normalize(year.Etat)==='prevision';
    const allUsers=(state.raw.users||[]).map(u=>({
      id:u.id,last:toText(u.Nom),first:toText(u.Prenom),
      name:`${toText(u.Nom).toUpperCase()} ${toText(u.Prenom)}`.trim(),
      departed:truthy(u.Parti_e),flags:null,raw:u
    }));
    const usersById=new Map(allUsers.map(u=>[u.id,u]));
    const activitiesById=state.byId.activities;
    const participationRows=forecast ? (state.raw.forecasts||[]) : (state.raw.participations||[]);
    if (forecast && !state.tablesExisting.includes(TABLES.forecasts)) {
      problems.push('Année « Prévision » : table Planning_previsionnel introuvable.');
    }

    const enrolled=new Map();
    const usedActivityIds=new Set();
    const attachedUserIds=new Set();
    for (const p of participationRows) {
      if (firstId(p.Annee)!==yearId) continue;
      const activityId=firstId(p.Activites);
      const activity=activitiesById.get(activityId);
      if (!activity) { notes.push('Une participation fait référence à une activité inexistante.'); continue; }
      if (firstId(activity.Annee) && firstId(activity.Annee)!==yearId) {
        problems.push('Activité « '+toText(activity.Nom_activite)+' » liée à une autre année que sa participation.');
        continue;
      }
      usedActivityIds.add(activityId);
      const participants=ids(p.Participants);
      if (!enrolled.has(activityId)) enrolled.set(activityId,new Set());
      for (const id of participants) { enrolled.get(activityId).add(id); attachedUserIds.add(id); }
    }
    for (const activity of state.raw.activities) {
      if (firstId(activity.Annee)===yearId) usedActivityIds.add(activity.id);
    }
    const namedAnimators=state.byId.animators;
    const activities=[];
    for (const id of usedActivityIds) {
      const a=activitiesById.get(id);
      if (!a) continue;
      const day=getDay(a.Jour,a.Numero_du_jour_de_la_semaine);
      const time=timeText(a.Heure_debut);
      const half=periodFromTime(time);
      if (!day || !half) {
        problems.push(`Activité « ${toText(a.Nom_activite)} » : jour ou heure de début introuvable.`);
        continue;
      }
      const staffIds=ids(a.Animateur_s);
      const staffRows=staffIds.map(x=>namedAnimators.get(x)).filter(Boolean);
      const staff=staffRows.map(s=>toText(s.Nom2)||`${toText(s.Prenom)} ${toText(s.Nom)}`.trim()).filter(Boolean);
      const hasSAJ=staffRows.some(s=>/\bsaj\b/.test(normalize(s.Status)));
      const hasExternal=staffRows.some(s=>/\bltc\b|\bintervenant\b|\bodyneo\b|\bbenevole\b/.test(normalize(s.Status)));
      const unknownStaff=staffRows.filter(s=>!toText(s.Status) || !/\bsaj\b|\bltc\b|\bintervenant\b|\bodyneo\b|\bbenevole\b/.test(normalize(s.Status)));
      if (!staffRows.length && !isFree(a.Nom_activite) && !isReference(a.Nom_activite)) notes.push(`Activité « ${toText(a.Nom_activite)} » : animateur non renseigné.`);
      if (unknownStaff.length) {
        const message=`Activité « ${toText(a.Nom_activite)} » : statut d’animateur non reconnu.`;
        if (hasSAJ) notes.push(message); else problems.push(message+' Vérifier le classement SAJ / extérieur.');
      }
      const kind=isFree(a.Nom_activite)?'free':isReference(a.Nom_activite)?'reference':hasSAJ?'activity':hasExternal?'external':'activity';
      activities.push({id:a.id,name:toText(a.Nom_activite)||'Activité',day,half,sortMinute:minuteOf(time),
        kind,staff:staff.join(' · '),userIds:enrolled.get(a.id)||new Set(),open:truthy(a.Groupe_ouvert)});
    }

    // Absences annuelles : historique = table Presences_annuelles, année actuelle = drapeaux Usagers.
    const presenceRows=(state.raw.annualPresence||[]).filter(p=>firstId(p.Annee)===yearId);
    const presenceMap=new Map(presenceRows.map(p=>[firstId(p.Usager)||firstId(p.Usagers),p]));
    if (presenceRows.length && presenceMap.size!==presenceRows.length) notes.push('Présences annuelles : doublons ou références d’usagers manquantes.');
    if (!isCurrent && !presenceRows.length) {
      problems.push('Les jours de présence historiques ne sont pas enregistrés. Ajouter Presences_annuelles pour cette année avant d’archiver/imprimer.');
    }
    const selectedUsers=allUsers.filter(u => {
      if (isCurrent) return !u.departed;
      if (presenceMap.size) return presenceMap.has(u.id);
      return attachedUserIds.has(u.id);
    });
    selectedUsers.sort((a,b)=> a.last.localeCompare(b.last,'fr',{sensitivity:'base'}) || a.first.localeCompare(b.first,'fr',{sensitivity:'base'}));
    for (const u of selectedUsers) {
      const source=presenceMap.get(u.id)|| (isCurrent?u.raw:null);
      if (isCurrent && presenceRows.length && !presenceMap.has(u.id)) problems.push(`Présence annuelle manquante pour « ${u.name} » ; compléter la table Presences_annuelles.`);
      if (!isCurrent && !source) problems.push(`Présence historique inconnue pour « ${u.name} ».`);
      u.flags=source ? DAYS.map(d => truthy(source[d.short])) : null;
    }
    if (selectedUsers.length===0) notes.push('Aucun usager trouvé pour cette année. Ton fichier .grist peut ne contenir que la structure des tables.');
    if (isCurrent && state.raw.users.length && selectedUsers.length===0) notes.push('Tous les usagers semblent marqués comme partis.');

    // Rendez-vous Kiné/Ortho : historisation obligatoire pour les années anciennes.
    const rehabColumnPresent=(state.tableColumns.reeducations||[]).includes('Annee');
    const reeducationModels=[];
    if (rehabColumnPresent && state.raw.reeducations.some(r=>!firstId(r.Annee))) {
      problems.push('Certains rendez-vous Reeducations ne sont pas reliés à une année : compléter la colonne Annee pour fiabiliser les plannings et archives.');
    }
    if (!rehabColumnPresent && !isCurrent) {
      problems.push('Reeducations.Annee est absent : impossible de garantir les rendez-vous des années archivées.');
    }
    for (const r of state.raw.reeducations) {
      if (rehabColumnPresent ? firstId(r.Annee)!==yearId : !isCurrent) continue;
      const type=state.byId.reeducationTypes.get(firstId(r.Type));
      const typeName=toText(type?.Type)||toText(r.gristHelper_Display6);
      if (!isRehab(typeName)) continue;
      const day=getDay(r.Jour,r.Jour_Num_jour||r.Num_du_jour);
      const rawHour=timeText(r.Horaire);
      const half=periodFromTime(rawHour);
      const userId=firstId(r.Usagers);
      if (!day || !half || !rawHour || !userId) {
        problems.push('Un rendez-vous kiné/ortho manque d’un jour, d’un usager ou d’un horaire.');
        continue;
      }
      attachedUserIds.add(userId);
      const start=compactTime(rawHour);
      if (start.length>6) notes.push(`Horaire « ${rawHour} » : vérifier sa lisibilité sur le PDF.`);
      const rehabKind = /\bkine\b|\bkinesitherap/.test(normalize(typeName)) ? 'kine' : 'ortho';
      reeducationModels.push({userId,day,half,start,rawHour,type:typeName,rehabKind});
    }
    // Règle : au maximum un rendez-vous kiné par usager et par JOUR,
    // tout en permettant kiné le matin ET orthophonie l'après-midi.
    const kinePerDay = new Map();
    for (const r of reeducationModels) {
      if (r.rehabKind !== 'kine') continue;
      const key = `${r.userId}-${r.day}`;
      kinePerDay.set(key,(kinePerDay.get(key)||0)+1);
      if (kinePerDay.get(key) === 2) {
        const person = usersById.get(r.userId);
        problems.push(`Deux rendez-vous kiné le même jour pour ${person?.name||'usager '+r.userId} : corriger Reeducations.`);
      }
    }
    // Signaler, sans supprimer, une incohérence de rendez-vous sur un jour d'absence habituelle.
    const flagsById=new Map(selectedUsers.map(u=>[u.id,u.flags]));
    for (const r of reeducationModels) {
      const flags=flagsById.get(r.userId);
      if (flags && !flags[r.day-1]) notes.push('Rendez-vous prévu un jour sans présence habituelle : vérifier le planning de l’usager concerné.');
    }

    const dayGroups=[];
    for (const d of DAYS) {
      const halves=[];
      for (const half of PERIODS) {
        const group=activities.filter(a=>a.day===d.i&&a.half===half);
        const byKind=['activity','external'].flatMap(kind=>group.filter(a=>a.kind===kind)
          .sort((a,b)=>a.sortMinute-b.sortMinute || a.name.localeCompare(b.name,'fr'))
          .map(a=>({...a,kind:'activity'===kind?'activity':'external',key:`activity-${a.id}`})));
        const special=['rehab','reference','free'].map(kind=>({kind,day:d.i,half,key:`${kind}-${d.i}-${half}`,
          name:kind==='rehab'?'Kiné / Ortho':kind==='reference'?'Temps de référence':'Temps libre',
          userIds:new Set(group.filter(a=>a.kind===kind).flatMap(a=>[...a.userIds])),
          appointments:new Map()}));
        const rehab=special[0];
        for (const r of reeducationModels.filter(r=>r.day===d.i&&r.half===half)) {
          if (!rehab.appointments.has(r.userId)) rehab.appointments.set(r.userId,[]);
          rehab.appointments.get(r.userId).push(r.start);
        }
        const cols=[...byKind,...special];
        cols.forEach((c,i)=>{c.halfStart=i===0; c.dayStart=i===0&&half==='matin';});
        halves.push({label:half==='matin'?'Matin':'Après-midi',cols,half});
      }
      dayGroups.push({day:d,halves,cols:halves.flatMap(h=>h.cols),color:colorOfDay(d.i)});
    }

    let regularCount=dayGroups.flatMap(d=>d.cols).filter(c=>['activity','external'].includes(c.kind)).length;
    const specialTotal=10*(PRINT.rehabWidth+PRINT.referenceWidth+PRINT.freeWidth);
    const available=PRINT.usableWidth-PRINT.indexWidth-PRINT.userWidth-specialTotal;
    const regularWidth=regularCount ? Math.min(PRINT.maxActivityWidth,available/regularCount):PRINT.maxActivityWidth;
    if (regularCount&&regularWidth<PRINT.minActivityWidth) problems.push(`Trop de colonnes (${regularCount} activités) pour un A3 lisible : largeur par activité ${regularWidth.toFixed(2)} mm.`);
    const actualRegularWidth=Math.max(PRINT.minActivityWidth,regularWidth);
    const usedWidth=PRINT.indexWidth+PRINT.userWidth+specialTotal+actualRegularWidth*regularCount;
    const rowHeight=selectedUsers.length ? Math.min(PRINT.maxRowHeight,(PRINT.usableHeight-PRINT.fixedHeight)/selectedUsers.length):PRINT.maxRowHeight;
    if (rowHeight<PRINT.minRowHeight) problems.push(`Trop d’usagers (${selectedUsers.length}) pour une seule page A3 lisible : hauteur ${rowHeight.toFixed(2)} mm.`);
    if (usedWidth>PRINT.usableWidth+0.1) problems.push('La grille dépasse la largeur d’impression A3.');
    const maxAppointments=Math.max(0,...reeducationModels.reduce((map,r)=>{
      const k=`${r.userId}-${r.day}-${r.half}`;map.set(k,(map.get(k)||0)+1);return map;
    },new Map()).values());
    if (maxAppointments>2) problems.push('Plus de deux rendez-vous kiné/ortho dans une même case : affichage trop dense, y compris en A3.');
    if (maxAppointments>1&&rowHeight<5.3) problems.push('Plusieurs horaires dans une case kiné/ortho et lignes trop basses pour les afficher correctement.');

    return {year,people:selectedUsers,days:dayGroups,notes,problems,
      widths:{activity:actualRegularWidth,index:PRINT.indexWidth,user:PRINT.userWidth,used:usedWidth,rowHeight:Math.max(rowHeight,PRINT.minRowHeight)},
      activitiesCount:regularCount,rehabCount:reeducationModels.length};
  }

  function widthsForColumn(c, model) {
    if (c.kind==='rehab') return PRINT.rehabWidth;
    if (c.kind==='reference') return PRINT.referenceWidth;
    if (c.kind==='free') return PRINT.freeWidth;
    return model.widths.activity;
  }
  function cellFor(user,col,fullDayPresent) {
    const classes=`kind-${col.kind}${col.dayStart?' day-start':col.halfStart?' half-start':''}`;
    if (col.kind==='rehab') {
      const times=col.appointments.get(user.id)||[];
      const text=times.map(escapeHtml).join('<br>');
      return `<td class="${classes}${times.length>1?' multi-rehab':''}" title="${escapeHtml(times.join(' / '))}">${text}</td>`;
    }
    if (col.kind==='reference'||col.kind==='free') {
      return `<td class="${classes}">${col.userIds.has(user.id)?'X':''}</td>`;
    }
    if (col.userIds.has(user.id)) return `<td class="${classes}" aria-label="Inscrit">X</td>`;
    // Groupe ouvert : proposé à une personne présente sans inscription pour cette demi-journée,
    // mais jamais marqué X automatiquement (ce n'est PAS une inscription).
    if (col.open && fullDayPresent) {
      const day=state.model.days.find(g=>g.day.i===col.day);
      const h=day?.halves.find(g=>g.half===col.half);
      const registered=h?.cols.some(c=>['activity','external','reference','free'].includes(c.kind) && c.userIds.has(user.id));
      if (!registered) return `<td class="${classes}" title="Groupe ouvert proposé ; non-inscrit">○</td>`;
    }
    return `<td class="${classes}"></td>`;
  }
  function render() {
    if (!state.loaded) return;
    const model=createModel(); state.model=model;
    const allProblems=[...model.problems];
    if (!model.year) { $('sheet').hidden=true; warningPanel(allProblems); showStatus('Pas d’année scolaire.'); return; }
    populatePerson(model.people);
    $('titleYear').textContent=toText(model.year.Annee);
    $('footerYear').textContent='SAJ Anagallis · '+toText(model.year.Annee);
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
    document.documentElement.style.setProperty('--row-mm', `${model.widths.rowHeight.toFixed(3)}mm`);
    const columns=model.days.flatMap(d=>d.cols);
    // Colgroup garantit un tableau parfaitement aligné, même avec un nombre variable d'activités.
    const colgroup=`<colgroup><col style="width:${model.widths.index}mm"><col style="width:${model.widths.user}mm">${columns.map(c=>`<col style="width:${widthsForColumn(c,model).toFixed(3)}mm">`).join('')}</colgroup>`;
    const heads1=model.days.map(g=>`<th colspan="${g.cols.length}" style="background-color:${g.color}">${escapeHtml(g.day.name)}</th>`).join('');
    const heads2=model.days.map(g=>g.halves.map(h=>`<th colspan="${h.cols.length}" class="half-name">${h.label}</th>`).join('')).join('');
    const heads3=columns.map(c=>{
      const label=c.kind==='rehab'?'Kiné / Ortho':c.name;
      const staff=c.kind==='activity'||c.kind==='external'?`<div class="head-pro"><span class="vertical-label" title="${escapeHtml(c.staff)}">${escapeHtml(c.staff)}</span></div>`:'';
      return `<th class="kind-${c.kind}${c.dayStart?' day-start':c.halfStart?' half-start':''}"><div class="column-head"><div class="head-activity"><span class="vertical-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span></div>${staff}</div></th>`;
    }).join('');
    const body=model.people.map((u,i)=>{
      let tds='';
      for (const g of model.days) {
        const present=u.flags?.[g.day.i-1];
        if (present===false) {
          tds+=`<td colspan="${g.cols.length}" class="absent day-start">Absent</td>`;
        } else {
          tds+=g.cols.map(c=>cellFor(u,c,present)).join('');
        }
      }
      return `<tr data-usager="${u.id}" class="${u.id===state.selectedUserId?'selected':''}"><td class="ordinal">${i+1}</td><td class="usager" title="${escapeHtml(u.name)}">${escapeHtml(u.name)}</td>${tds}</tr>`;
    }).join('');
    const html=`<table class="planning-table" aria-label="Planning général des usagers"><caption class="sr-only">Planning ${escapeHtml(model.year.Annee)}</caption>${colgroup}<thead><tr class="day-row"><th rowspan="3" class="identity">N°</th><th rowspan="3" class="identity">Usagers</th>${heads1}</tr><tr class="half-row">${heads2}</tr><tr class="header-row">${heads3}</tr></thead><tbody>${body}</tbody></table>`;
    $('tableHost').innerHTML=html;
    $('sheet').hidden=false;
    warningPanel([...model.problems,...model.notes]);
    const ok=model.people.length>0 && allProblems.length===0;
    $('printBtn').disabled=!ok;
    $('pdfBtn').disabled=!ok;
    showStatus(`${model.people.length} usagers · ${model.activitiesCount} colonnes d’activités · ${model.rehabCount} rendez-vous kiné/ortho. ${ok?'Impression '+state.paper.toUpperCase()+' possible après vérification visuelle.':'Impression désactivée : corriger les problèmes signalés.'}`,!ok);
  }

  // Une seule grille logique : A4 est une réduction proportionnelle A3 -> A4.
  // Aucune donnée n'est retirée pour l'A4 ; le texte est nécessairement plus petit.
  function applyPaperFormat() {
    const paper = state.paper === 'a4' ? 'a4' : 'a3';
    document.body.classList.toggle('format-a4', paper === 'a4');
    document.documentElement.style.setProperty('--print-usable-width', paper === 'a4' ? '287mm' : '410mm');
    document.documentElement.style.setProperty('--print-usable-height', paper === 'a4' ? '200mm' : '287mm');
    let rule = $('paperPageRule');
    if (!rule) {
      rule = document.createElement('style');
      rule.id = 'paperPageRule';
      document.head.appendChild(rule);
    }
    rule.textContent = `@page { size: ${paper.toUpperCase()} landscape; margin: 5mm; }`;
    $('sheet').setAttribute('aria-label', `Planning ${paper.toUpperCase()} paysage`);
    $('formatNote').textContent = paper === 'a4'
      ? 'A4 paysage : planning A3 réduit proportionnellement à 70 %. Vérifier la lisibilité avant impression.'
      : 'A3 paysage : format conseillé pour la lisibilité. Pour le PDF, choisir « Enregistrer au format PDF ».';
  }

  function preparePrint(intent) {
    if (!state.model || state.model.problems.length || !state.model.people.length) return;
    applyPaperFormat();
    const sheet=$('sheet');
    const table=$('tableHost').querySelector('table');
    const issues=[];
    if (!table || table.getBoundingClientRect().width > sheet.getBoundingClientRect().width+3) {
      issues.push('La grille dépasse la largeur de sa feuille.');
    }
    for (const element of table?.querySelectorAll('.head-activity .vertical-label, .head-pro .vertical-label, .kind-rehab:not(th)')||[]) {
      if (element.scrollHeight>element.clientHeight+2 || element.scrollWidth>element.clientWidth+2) {
        issues.push('Au moins un texte d’en-tête ou horaire dépasse sa case.'); break;
      }
    }
    const paperHeight = state.paper==='a4' ? 200 : 287;
    const contentHeightMm = sheet.getBoundingClientRect().height / (96 / 25.4);
    // En aperçu A4, zoom=0.7. On contrôle donc la hauteur physique finale.
    if (contentHeightMm > paperHeight + .7) {
      issues.push(`Le planning fait ${contentHeightMm.toFixed(1)} mm de hauteur pour ${paperHeight} mm disponibles.`);
    }
    if (issues.length) {
      warningPanel([...state.model.problems,...state.model.notes,...issues]);
      showStatus('Impression bloquée : des éléments ne tiennent pas dans leur case ou leur page.',true);
      return;
    }
    $('printDate').textContent='Édité le '+new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
    document.title=`Planning_SAJ_Anagallis_${toText(state.model.year.Annee).replace(/[^\w-]+/g,'-')}_${state.paper.toUpperCase()}`;
    if (intent==='pdf') {
      showStatus(`Pour enregistrer le PDF ${state.paper.toUpperCase()} : choisir « Enregistrer au format PDF » dans la fenêtre du navigateur, garder le format ${state.paper.toUpperCase()} et activer les arrière-plans.`);
    }
    window.print();
  }
  function bindEvents() {
    $('yearSelect').addEventListener('change',e=>{state.selectedYearId=Number(e.target.value);render();});
    $('personSelect').addEventListener('change',e=>{state.selectedUserId=Number(e.target.value)||null;render();});
    $('refreshBtn').addEventListener('click',loadData);
    $('formatSelect').addEventListener('change',e=>{state.paper=e.target.value==='a4'?'a4':'a3';applyPaperFormat();if(state.loaded)render();});
    $('printBtn').addEventListener('click',()=>preparePrint('print'));
    $('pdfBtn').addEventListener('click',()=>preparePrint('pdf'));
    $('tableHost').addEventListener('click',e=>{
      const row=e.target.closest('tr[data-usager]');
      if (!row) return;
      state.selectedUserId=Number(row.dataset.usager);
      $('personSelect').value=state.selectedUserId;
      $('tableHost').querySelectorAll('tbody tr').forEach(x=>x.classList.toggle('selected',x===row));
    });
  }
  async function start() {
    bindEvents();
    applyPaperFormat();
    if (!window.grist) { showStatus('Widget prêt. Ouvre cette page à l’intérieur de ton document Grist.',true);return; }
    grist.ready({requiredAccess:'full'});
    if (typeof grist.onRecords==='function') grist.onRecords(()=>{
      clearTimeout(state.refreshTimer);
      state.refreshTimer=setTimeout(loadData,400);
    });
    await loadData();
  }
  start().catch(error=>{console.error(error);showStatus(error.message||String(error),true);});
})();
