'use strict';


/* ============================================================
   PLANNING COLLECTIF
   UNE PAGE A3 PAR JOUR
   LUNDI → VENDREDI
   ============================================================ */


/* ============================================================
   TABLES GRIST
   ============================================================ */

const TABLES = {

  participations:
    'Participations',

  activites:
    'Activites',

  usagers:
    'Usagers',

  jours:
    'Jours_de_la_semaine',

  heures:
    'Heures',

  animateurs:
    'Animateurs'

};


/* ============================================================
   JOURS
   ============================================================ */

const DAYS = [

  {

    name:
      'Lundi',

    color:
      '#1598e2',

    background:
      'rgba(21,152,226,.10)'

  },


  {

    name:
      'Mardi',

    color:
      '#2bb447',

    background:
      'rgba(43,180,71,.10)'

  },


  {

    name:
      'Mercredi',

    color:
      '#c15bdf',

    background:
      'rgba(193,91,223,.10)'

  },


  {

    name:
      'Jeudi',

    color:
      '#eda820',

    background:
      'rgba(237,168,32,.10)'

  },


  {

    name:
      'Vendredi',

    color:
      '#d65357',

    background:
      'rgba(214,83,87,.10)'

  }

];


/* ============================================================
   ÉTAT
   ============================================================ */

const state = {

  tables: {},

  activities: [],

  usersById:
    new Map(),

  attachmentUrls:
    new Map()

};


let attachmentTokenInfo =
  null;


const $ =
  id =>
    document.getElementById(id);


/* ============================================================
   TABLE GRIST → LIGNES
   ============================================================ */

function rowsFromTable(table) {

  if (
    !table
    ||
    !Array.isArray(table.id)
  ) {

    return [];

  }


  return table.id.map(

    (
      id,
      index
    ) => {

      const row = {
        id
      };


      for (
        const [
          key,
          value
        ]
        of Object.entries(table)
      ) {

        row[key] =
          Array.isArray(value)
            ? value[index]
            : value;

      }


      return row;

    }

  );

}


/* ============================================================
   RÉFÉRENCES GRIST
   ============================================================ */

function refIds(value) {

  if (
    value === null
    ||
    value === undefined
    ||
    value === ''
  ) {

    return [];

  }


  if (
    Array.isArray(value)
  ) {

    const values =

      value[0] === 'L'

        ?

        value.slice(1)

        :

        value;


    return values

      .flat()

      .map(Number)

      .filter(
        Number.isFinite
      );

  }


  const number =
    Number(value);


  return Number.isFinite(number)

    ?

    [number]

    :

    [];

}


/* ============================================================
   INDEX
   ============================================================ */

function byId(rows) {

  return new Map(

    rows.map(
      row => [

        Number(row.id),

        row

      ]
    )

  );

}


/* ============================================================
   TEXTE
   ============================================================ */

function text(
  value,
  fallback = ''
) {

  if (
    value === null
    ||
    value === undefined
    ||
    value === ''
  ) {

    return fallback;

  }


  return String(value);

}



/* ============================================================
   CHAMPS SOUPLES / ACTIVITÉ OUVERTE
   ============================================================ */

function normalizeFieldName(value) {

  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

}


function fieldValue(row, candidates) {

  if (!row) {
    return undefined;
  }

  const wanted =
    new Set(
      candidates.map(normalizeFieldName)
    );

  for (const [key, value] of Object.entries(row)) {

    if (wanted.has(normalizeFieldName(key))) {
      return value;
    }

  }

  return undefined;

}


function truthy(value) {

  if (value === true) {
    return true;
  }

  if (value === false || value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized =
    text(value)
      .trim()
      .toLowerCase();

  return [
    '1',
    'true',
    'oui',
    'yes',
    'x',
    'ouvert',
    'ouverte'
  ].includes(normalized);

}


function isActivityOpen(row) {

  return truthy(
    fieldValue(
      row,
      [
        'Groupe ouvert',
        'Groupe_ouvert',
        'GroupeOuvert',
        'Ouvert',
        'Ouverte',
        'Activité ouverte',
        'Activite ouverte'
      ]
    )
  );

}


function canShareRow(activity) {

  const count =
    activity?.participants
      ? activity.participants.size
      : 0;

  /*
   * PRIORITÉ AU GABARIT > 9 DU CROQUIS :
   * dès qu'une activité compte plus de 9 participants, elle passe
   * obligatoirement en pleine largeur, même si « Groupe ouvert » est coché.
   * Ainsi le visuel spécifique > 9 n'est jamais remplacé par une demi-tuile.
   */
  if (count > 9) {
    return false;
  }

  /*
   * De 0 à 9 participants, la tuile peut partager sa ligne.
   * Une activité ouverte sans liste nominative reste donc naturellement
   * compatible avec l'affichage deux activités côte à côte.
   */
  return count <= 9 || Boolean(activity?.isOpen);

}

/* ============================================================
   ÉCHAPPEMENT HTML
   ============================================================ */

function esc(value) {

  return text(value)

    .replace(

      /[&<>"']/g,

      character => ({

        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        '"':
          '&quot;',

        "'":
          '&#039;'

      })[character]

    );

}


/* ============================================================
   JOUR
   ============================================================ */

function normalizeDay(value) {

  const normalized =
    text(value)
      .trim()
      .toLowerCase();


  const found =
    DAYS.find(

      day =>
        day.name
          .toLowerCase()

        ===

        normalized

    );


  return found
    ? found.name
    : text(value);

}


/* ============================================================
   HEURE → MINUTES
   ============================================================ */

function minutes(value) {

  const match =
    text(value)
      .match(
        /(\d{1,2})\D(\d{2})/
      );


  if (
    !match
  ) {

    return 9999;

  }


  return (

    Number(match[1])
    *
    60

    +

    Number(match[2])

  );

}


/* ============================================================
   INITIALES
   ============================================================ */

function initials(name) {

  return text(
    name,
    '?'
  )

    .split(/\s+/)

    .filter(Boolean)

    .slice(0, 2)

    .map(
      part =>
        part
          .charAt(0)
          .toUpperCase()
    )

    .join('');

}


/* ============================================================
   COULEUR DES ACTIVITÉS
   ============================================================ */

function colorFor(name) {

  let hue = 0;


  for (
    const character
    of text(name)
  ) {

    hue =

      (
        hue * 31
        +
        character
          .charCodeAt(0)
      )

      %

      360;

  }


  return (
    `hsl(${hue} 48% 48%)`
  );

}


/* ============================================================
   URL DES IMAGES GRIST
   ============================================================ */

async function attachmentUrl(
  value
) {

  const ids =
    refIds(value);


  if (
    !ids.length
  ) {

    return '';

  }


  const id =
    ids[0];


  if (
    state
      .attachmentUrls
      .has(id)
  ) {

    return state
      .attachmentUrls
      .get(id);

  }


  try {

    if (
      !attachmentTokenInfo
    ) {

      attachmentTokenInfo =
        await grist.docApi
          .getAccessToken({

            readOnly:
              true

          });

    }


    const url =

      `${attachmentTokenInfo.baseUrl}`

      +

      `/attachments/${id}/download`

      +

      `?auth=${encodeURIComponent(
        attachmentTokenInfo.token
      )}`;


    state
      .attachmentUrls
      .set(
        id,
        url
      );


    return url;

  }


  catch (
    error
  ) {

    console.error(

      'Impossible de charger la pièce jointe',

      id,

      error

    );


    return '';

  }

}


/* ============================================================
   CHARGEMENT GRIST
   ============================================================ */

async function fetchAll() {

  showStatus(
    'Lecture des tables Grist…'
  );


  attachmentTokenInfo =
    null;


  state
    .attachmentUrls
    .clear();


  const entries =
    await Promise.all(

      Object.entries(
        TABLES
      )

      .map(

        async (
          [
            key,
            tableName
          ]
        ) => {

          const table =
            await grist.docApi
              .fetchTable(
                tableName
              );


          return [

            key,

            rowsFromTable(
              table
            )

          ];

        }

      )

    );


  state.tables =
    Object.fromEntries(
      entries
    );


  buildModel();


  await render();

}


/* ============================================================
   MODÈLE
   ============================================================ */

function buildModel() {

  const users =
    state.tables.usagers;


  const activities =
    state.tables.activites;


  const participations =
    state.tables.participations;


  const days =
    byId(
      state.tables.jours
    );


  const hours =
    byId(
      state.tables.heures
    );


  const animators =
    byId(
      state.tables.animateurs
    );


  state.usersById =
    byId(users);



  /* ========================================================
     ASSOCIATION ACTIVITÉ → PARTICIPANTS
     ======================================================== */

  const participantsByActivity =
    new Map();


  for (
    const participation
    of participations
  ) {

    const activityId =
      refIds(
        participation.Activites
      )[0];


    if (
      !activityId
    ) {

      continue;

    }


    const participantSet =

      participantsByActivity
        .get(activityId)

      ||

      new Set();


    refIds(
      participation.Participants
    )

    .forEach(

      participantId => {

        participantSet.add(
          Number(participantId)
        );

      }

    );


    participantsByActivity
      .set(

        activityId,

        participantSet

      );

  }



  /* ========================================================
     ACTIVITÉS
     ======================================================== */

  state.activities =

    activities

      .map(

        activity => {


          /* JOUR */

          const dayRow =
            days.get(

              refIds(
                activity.Jour
              )[0]

            );


          /* DÉBUT */

          const startRow =
            hours.get(

              refIds(
                activity.Heure_debut
              )[0]

            );


          /* FIN */

          const endRow =
            hours.get(

              refIds(
                activity.Heure_fin
              )[0]

            );


          /* ANIMATEURS */

          const animatorNames =

            refIds(
              activity.Animateur_s
            )

            .map(

              id =>
                animators.get(
                  Number(id)
                )

            )

            .filter(Boolean)

            .map(

              animator => {

                const displayName =
                  text(
                    animator.Nom2
                  );


                if (
                  displayName
                ) {

                  return displayName;

                }


                return (

                  `${text(
                    animator.Prenom
                  )} ${text(
                    animator.Nom
                  )}`

                ).trim();

              }

            )

            .filter(Boolean);



          return {

            id:
              Number(
                activity.id
              ),

            name:
              text(

                activity.Nom_activite,

                'Activité'

              ),

            day:
              normalizeDay(

                dayRow?.Jour

                ||

                activity
                  .gristHelper_Display2

              ),

            dayOrder:
              Number(

                activity
                  .Jour_Num_jour

                ||

                dayRow?.Num_jour

                ||

                99

              ),

            start:
              text(

                startRow?.Heures

                ||

                activity
                  .gristHelper_Display3

              ),

            end:
              text(

                endRow?.Heures

                ||

                activity
                  .gristHelper_Display4

              ),

            
            remarks:
              text(

                activity.Remarques_planning

                ||

                activity.remarques_planning

                ||

                activity['Remarques planning']

                ||

                activity['remarques planning']

              ),

animators:
              animatorNames,

            visual:
              activity.Visuel,

            isOpen:
              isActivityOpen(activity),

            participants:

              participantsByActivity
                .get(
                  Number(activity.id)
                )

              ||

              new Set()

          };

        }

      )

      .sort(
        sortActivities
      );

}


/* ============================================================
   TRI ACTIVITÉS
   ============================================================ */

function sortActivities(
  a,
  b
) {

  const dayComparison =
    a.dayOrder
    -
    b.dayOrder;


  if (
    dayComparison !== 0
  ) {

    return dayComparison;

  }


  const timeComparison =
    minutes(a.start)
    -
    minutes(b.start);


  if (
    timeComparison !== 0
  ) {

    return timeComparison;

  }


  /*
   * À heure identique, on regroupe d'abord les activités
   * qui peuvent s'afficher en demi-largeur (0 à 9 participants).
   * Au-delà de 9, le gabarit spécifique du croquis est prioritaire.
   * Elles se suivent donc dans la grille et se placent
   * naturellement deux par deux sur la même ligne.
   */
  const aParticipantCount =
    a.participants
      ? a.participants.size
      : 0;


  const bParticipantCount =
    b.participants
      ? b.participants.size
      : 0;


  const aHalfWidth =
    canShareRow(a);


  const bHalfWidth =
    canShareRow(b);


  if (
    aHalfWidth !== bHalfWidth
  ) {

    return aHalfWidth
      ? -1
      : 1;

  }


  return a.name.localeCompare(
    b.name,
    'fr',
    {
      sensitivity: 'base'
    }
  );

}


/* ============================================================
   MATIN / APRÈS-MIDI
   ============================================================ */

function periodOf(activity) {

  return (

    minutes(
      activity.start
    )

    <

    12 * 60

  )

    ?

    'Matin'

    :

    'ApresMidi';

}


/* ============================================================
   NOM USAGER
   ============================================================ */

function userFullName(
  user
) {

  if (
    !user
  ) {

    return '';

  }


  return text(

    user.Usager,

    (
      `${text(
        user.Prenom
      )} ${text(
        user.Nom
      )}`
    ).trim()

  );

}


/* ============================================================
   PRÉNOM
   ============================================================ */

function userFirstName(
  user
) {

  if (
    !user
  ) {

    return '';

  }


  return text(

    user.Prenom,

    userFullName(user)

  );

}


/* ============================================================
   HTML PARTICIPANT
   ============================================================ */

async function participantHtml(
  participantId
) {

  const user =
    state
      .usersById
      .get(
        Number(participantId)
      );


  if (
    !user
  ) {

    return '';

  }


  const fullName =
    userFullName(user);


  const firstName =
    userFirstName(user);


  const portraitUrl =
    await attachmentUrl(
      user.Portrait
    );


  let photoHtml;


  if (
    portraitUrl
  ) {

    photoHtml = `

      <div class="participant-photo">

        <img
          src="${portraitUrl}"
          alt="${esc(fullName)}"
        >

      </div>

    `;

  }


  else {

    photoHtml = `

      <div class="participant-photo">

        ${esc(
          initials(fullName)
        )}

      </div>

    `;

  }


  return `

    <div class="participant">

      ${photoHtml}

      <div class="participant-name">

        ${esc(firstName)}

      </div>

    </div>

  `;

}


/* ============================================================
   CARTE ACTIVITÉ — GABARIT A3
   ============================================================ */

async function activityCard(
  activity
) {

  const pictogramUrl =
    await attachmentUrl(
      activity.visual
    );


  const schedule =
    [
      activity.start,
      activity.end
    ]
      .filter(Boolean)
      .join(' – ');


  const participantIds =
    [...activity.participants];


  /* Tri alphabétique par nom puis prénom. */
  participantIds.sort(

    (
      firstId,
      secondId
    ) => {

      const first =
        state.usersById.get(
          Number(firstId)
        );

      const second =
        state.usersById.get(
          Number(secondId)
        );

      const firstLastName =
        text(first?.Nom);

      const secondLastName =
        text(second?.Nom);

      const lastNameComparison =
        firstLastName.localeCompare(
          secondLastName,
          'fr',
          { sensitivity: 'base' }
        );

      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return userFirstName(first)
        .localeCompare(
          userFirstName(second),
          'fr',
          { sensitivity: 'base' }
        );

    }

  );


  const participantCount =
    participantIds.length;


  /*
   * RÈGLE DE LARGEUR DEMANDÉE :
   * - 0 à 9 participants : demi-largeur ;
   * - activité ouverte sans dépassement de 9 personnes : demi-largeur ;
   * - plus de 9 participants : TOUJOURS pleine largeur afin d'appliquer
   *   le gabarit spécifique du croquis (> 9 personnes).
   */
  const useHalfWidth =
    canShareRow(activity);


  const sizeClass =
    participantCount <= 6
      ? 'activity-card--1-6'
      : participantCount <= 9
        ? 'activity-card--7-9'
        : 'activity-card--10plus';


  const participantElements =
    await Promise.all(
      participantIds.map(
        participantHtml
      )
    );


  const participantsHtml =
    participantElements
      .filter(Boolean)
      .join('');


  const cardColor =
    colorFor(
      activity.name
    );


  const remarksHtml =
    activity.remarks
      ? `
        <div class="activity-remarks">
          ${esc(activity.remarks)}
        </div>
      `
      : '';


  const animatorHtml =
    activity.animators.length
      ? `
        <div class="activity-meta">
          <strong>Avec :</strong>
          ${esc(activity.animators.join(', '))}
        </div>
      `
      : `
        <div class="activity-meta activity-meta--empty">
          <strong>Avec :</strong>
        </div>
      `;


  const pictogramHtml =
    pictogramUrl
      ? `
        <img
          class="activity-logo"
          src="${pictogramUrl}"
          alt=""
        >
      `
      : `
        <div
          class="activity-logo activity-logo--empty"
          aria-hidden="true"
        ></div>
      `;


  const peopleHtml =
    participantCount
      ? `
        <div
          class="participants-grid"
          aria-label="${participantCount} participant${participantCount > 1 ? 's' : ''}"
        >
          ${participantsHtml}
        </div>
      `
      : `
        <div class="participants-grid participants-grid--empty">
          <div class="empty-slot">
            Aucun participant renseigné
          </div>
        </div>
      `;


  return `
    <article
      class="activity-card ${useHalfWidth ? 'activity-card--half' : 'activity-card--full'} ${sizeClass}${activity.isOpen ? ' activity-card--open' : ''}"
      style="--card-color:${cardColor};"
      data-participants="${participantCount}"
    >

      <div class="activity-layout">

        <div class="activity-pictogram">
          ${pictogramHtml}
        </div>

        <div class="activity-main">

          <div class="activity-header">

            <h3 class="activity-title">
              ${esc(activity.name)}
            </h3>

            ${
              schedule
                ? `<div class="activity-time">${esc(schedule)}</div>`
                : ''
            }

            ${animatorHtml}
            ${remarksHtml}

          </div>

          ${peopleHtml}

        </div>

      </div>

    </article>
  `;

}


/* ============================================================
   PAGE A3 D'UNE DEMI-JOURNÉE
   ============================================================ */

async function periodHtml(
  title,
  activities,
  cssClass,
  day
) {

  let content;


  if (activities.length) {

    const cards =
      await Promise.all(
        activities.map(
          activityCard
        )
      );

    content =
      cards.join('');

  }

  else {

    content = `
      <div class="empty-period">
        Aucune activité renseignée
      </div>
    `;

  }


  return `
    <div class="a3-preview">

      <section
        class="period ${cssClass}"
        style="--day-color:${day.color}; --day-background:${day.background};"
        data-day="${esc(day.name)}"
        data-period="${esc(title)}"
      >

        <header class="period-page-header">
          <div class="period-day">
            ${esc(day.name)}
          </div>
          <div class="period-title">
            ${esc(title)}
          </div>
        </header>

        <div class="activities-list">
          ${content}
        </div>

        <footer class="period-footer">
          Odynéo · Les Tourrais de Craponne · Service d'accueil de jour Anagallis
        </footer>

      </section>

    </div>
  `;

}


/* ============================================================
   JOUR = 2 PAGES A3 : MATIN + APRÈS-MIDI
   ============================================================ */

async function dayPage(
  day
) {

  const activities =
    state.activities
      .filter(
        activity =>
          activity.day === day.name
      )
      .sort(
        sortActivities
      );


  const morning =
    activities.filter(
      activity =>
        periodOf(activity) === 'Matin'
    );


  const afternoon =
    activities.filter(
      activity =>
        periodOf(activity) === 'ApresMidi'
    );


  const morningHtml =
    await periodHtml(
      'MATIN',
      morning,
      'period-morning',
      day
    );


  const afternoonHtml =
    await periodHtml(
      'APRÈS-MIDI',
      afternoon,
      'period-afternoon',
      day
    );


  return `
    ${morningHtml}
    ${afternoonHtml}
  `;

}


/* ============================================================
   RENDU DE LA SEMAINE
   ============================================================ */

async function render() {

  const pages =
    $('pages');

  pages.innerHTML =
    '';


  const generated =
    await Promise.all(
      DAYS.map(
        dayPage
      )
    );


  pages.innerHTML =
    generated.join('');


  $('status')
    .classList
    .add('hidden');

  pages
    .classList
    .remove('hidden');


  requestAnimationFrame(
    () => {
      fitScreenPages();
      checkPageOverflow();
    }
  );

}


/* ============================================================
   STATUS
   ============================================================ */

function showStatus(
  message,
  error = false
) {

  const status =
    $('status');


  status.textContent =
    message;


  status
    .classList
    .toggle(
      'error',
      error
    );


  status
    .classList
    .remove(
      'hidden'
    );


  $('pages')
    .classList
    .add(
      'hidden'
    );

}


/* ============================================================
   ERREUR
   ============================================================ */

function showError(error) {

  console.error(
    error
  );


  showStatus(

    'Une erreur empêche l’affichage du planning.',

    true

  );


  $('errorText')
    .textContent =

      `${error?.message || error}

Vérifiez les tables :

${Object.values(TABLES).join('\n')}`;


  $('errorDialog')
    .showModal();

}



/* ============================================================
   APERÇU ÉCRAN = EXACTEMENT LA PAGE A3
   ============================================================ */

function fitScreenPages() {

  if (window.matchMedia('print').matches) {
    return;
  }

  const pages =
    $('pages');

  if (!pages) {
    return;
  }

  const availableWidth =
    Math.max(
      260,
      pages.clientWidth
    );


  document
    .querySelectorAll('.a3-preview')
    .forEach(
      wrapper => {

        const page =
          wrapper.querySelector('.period');

        if (!page) {
          return;
        }

        /* Mesure de la page A3 à sa taille CSS physique réelle. */
        page.style.transform =
          'none';

        const naturalWidth =
          page.offsetWidth;

        const naturalHeight =
          page.offsetHeight;

        const scale =
          Math.min(
            1,
            availableWidth / naturalWidth
          );

        wrapper.style.width =
          `${naturalWidth * scale}px`;

        wrapper.style.height =
          `${naturalHeight * scale}px`;

        page.style.transform =
          `scale(${scale})`;

      }
    );

}


function checkPageOverflow() {

  document
    .querySelectorAll('.period')
    .forEach(
      page => {

        const isOverflowing =
          page.scrollHeight > page.clientHeight + 2;

        page.classList.toggle(
          'period--overflow',
          isOverflowing
        );

      }
    );

}


window.addEventListener(
  'resize',
  fitScreenPages
);


window.addEventListener(
  'beforeprint',
  () => {
    document
      .querySelectorAll('.period')
      .forEach(
        page => {
          page.style.transform = 'none';
        }
      );
  }
);


window.addEventListener(
  'afterprint',
  () => {
    fitScreenPages();
  }
);


if ('ResizeObserver' in window) {

  const previewResizeObserver =
    new ResizeObserver(
      () => fitScreenPages()
    );

  previewResizeObserver.observe(
    document.documentElement
  );

}


/* ============================================================
   IMPRESSION
   ============================================================ */

$('printBtn')
  .addEventListener(

    'click',

    () => {

      window.print();

    }

  );


/* ============================================================
   INITIALISATION GRIST
   ============================================================ */

grist.ready({

  requiredAccess:
    'full'

});


grist.onOptions(

  (
    _options,
    interaction
  ) => {

    if (

      interaction?.access_level

      &&

      interaction.access_level
      !==
      'full'

    ) {

      showStatus(

        'Autorisez « Accès complet au document » pour lire les tables liées.',

        true

      );

    }

  }

);


/* ============================================================
   DÉMARRAGE
   ============================================================ */

fetchAll()
  .catch(
    showError
  );