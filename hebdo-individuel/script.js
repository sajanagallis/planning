'use strict';

const TABLES = {
  participations: 'Participations',
  activites: 'Activites',
  usagers: 'Usagers',
  jours: 'Jours_de_la_semaine',
  heures: 'Heures',
  animateurs: 'Animateurs',
  activitesAutres: 'Activites_autres',
  reeducations: 'Reeducations',
  reeducateurs: 'Reeducateurs'
};

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const DAY_COLORS = {
  Lundi: '#5b8def',
  Mardi: '#55a868',
  Mercredi: '#c77cff',
  Jeudi: '#e6a23c',
  Vendredi: '#e66b6b'
};

const state = {
  tables: {},
  people: [],
  activities: [],
  otherActivities: [],
  selectedId: null,
  attachmentUrls: new Map()
};

const $ = (id) => document.getElementById(id);


/* =========================================================
   OUTILS
   ========================================================= */

function rowsFromTable(table) {
  if (!table || !Array.isArray(table.id)) {
    return [];
  }

  return table.id.map((id, index) =>
    Object.fromEntries(
      Object.entries(table).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[index] : value
      ])
    )
  );
}

function isTrue(value) {
  return (
    value === true ||
    value === 1 ||
    value === 'true' ||
    value === 'TRUE'
  );
}

function refIds(value) {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value[0] === 'L'
      ? value.slice(1).filter(Number.isFinite)
      : value.filter(Number.isFinite);
  }

  return Number.isFinite(value)
    ? [value]
    : [];
}


function byId(rows) {
  return new Map(
    rows.map((row) => [row.id, row])
  );
}


function text(value, fallback = '') {
  return value == null || value === ''
    ? fallback
    : String(value);
}


function normalizeDay(value) {
  const normalized =
    text(value).trim().toLowerCase();

  return (
    DAYS.find(
      (day) =>
        day.toLowerCase() === normalized
    ) ||
    text(value, 'Jour')
  );
}


function minutes(value) {
  const match =
    text(value).match(
      /(\d{1,2})\D(\d{2})/
    );

  return match
    ? Number(match[1]) * 60 +
        Number(match[2])
    : 9999;
}


function initials(name) {
  return text(name, '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}


function colorFor(name) {
  let hue = 0;

  for (const character of text(name)) {
    hue =
      (hue * 31 +
        character.charCodeAt(0)) %
      360;
  }

  return `hsl(${hue} 48% 48%)`;
}


function esc(value) {
  return text(value).replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]
  );
}


function firstDefined(
  row,
  columnNames,
  fallback = ''
) {
  for (const columnName of columnNames) {
    if (
      row &&
      row[columnName] != null &&
      row[columnName] !== ''
    ) {
      return row[columnName];
    }
  }

  return fallback;
}


/*
 * Lecture robuste des colonnes Oui / Non de Grist.
 */
function isTrue(value) {
  if (
    value === true ||
    value === 1 ||
    value === '1'
  ) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized =
      value.trim().toLowerCase();

    return [
      'true',
      'oui',
      'yes',
      'vrai'
    ].includes(normalized);
  }

  return false;
}


/* =========================================================
   PIÈCES JOINTES GRIST
   ========================================================= */

let attachmentTokenInfo = null;


async function attachmentUrl(value) {
  const ids = refIds(value);

  if (!ids.length) {
    return '';
  }

  const id = ids[0];

  if (state.attachmentUrls.has(id)) {
    return state.attachmentUrls.get(id);
  }

  try {
    if (!attachmentTokenInfo) {
      attachmentTokenInfo =
        await grist.docApi.getAccessToken({
          readOnly: true
        });
    }

    const url =
      `${attachmentTokenInfo.baseUrl}/attachments/${id}/download` +
      `?auth=${encodeURIComponent(
        attachmentTokenInfo.token
      )}`;

    state.attachmentUrls.set(
      id,
      url
    );

    return url;

  } catch (error) {
    console.error(
      `Impossible de charger la pièce jointe ${id}`,
      error
    );

    return '';
  }
}


/* =========================================================
   CHARGEMENT DES TABLES
   ========================================================= */

async function fetchAll() {
  showStatus(
    'Lecture des tables Grist…'
  );

  const entries =
    await Promise.all(
      Object.entries(TABLES).map(
        async ([key, name]) => [
          key,
          await grist.docApi.fetchTable(name)
        ]
      )
    );

  state.tables =
    Object.fromEntries(
      entries.map(
        ([key, table]) => [
          key,
          rowsFromTable(table)
        ]
      )
    );

  buildModel();
  populatePeople();

  const first =
    state.people[0];

  if (first) {
    state.selectedId =
      first.id;

    $('personSelect').value =
      String(first.id);

    await render();

  } else {
    showStatus(
      'Aucun usager trouvé dans la table Usagers.',
      true
    );
  }
}


/* =========================================================
   CONSTRUCTION DU MODÈLE
   ========================================================= */

function buildModel() {
  const users =
    state.tables.usagers;

  const activities =
    state.tables.activites;

  const participations =
    state.tables.participations;

  const days =
    byId(state.tables.jours);

  const hours =
    byId(state.tables.heures);

  const animators =
    byId(state.tables.animateurs);

  const otherActivityTypes =
    byId(state.tables.activitesAutres);

  const partners =
    byId(state.tables.reeducateurs);


  /* ---------------------------------------------------------
     PARTICIPANTS PAR ACTIVITÉ
     --------------------------------------------------------- */

  const participantsByActivity =
    new Map();

  for (const participation of participations) {

    const activityId =
      refIds(
        participation.Activites
      )[0];

    if (!activityId) {
      continue;
    }

    const participantSet =
      participantsByActivity.get(
        activityId
      ) ||
      new Set();

    refIds(
      participation.Participants
    ).forEach(
      (participantId) => {
        participantSet.add(
          participantId
        );
      }
    );

    participantsByActivity.set(
      activityId,
      participantSet
    );
  }


  /* ---------------------------------------------------------
     USAGERS
     --------------------------------------------------------- */

  state.people = users
    .filter((user) => !isTrue(user.Parti_e))
    .map((user) => ({
      id: user.id,
      name: text(
        user.Usager,
        `${text(user.Prenom)} ${text(user.Nom)}`.trim()
      ),
      lastName: text(user.Nom).trim(),
      firstName: text(user.Prenom).trim(),
      portrait: user.Portrait,
      presence: refIds(user.Presence).map((id) =>
        normalizeDay(days.get(id)?.Jour)
      ),
      flags: {
        Lundi: user.Lu,
        Mardi: user.Ma,
        Mercredi: user.Me,
        Jeudi: user.Je,
        Vendredi: user.Ve
      }
    }))

    .sort((a, b) => {
      const lastNameComparison = a.lastName.localeCompare(
        b.lastName,
        'fr',
        { sensitivity: 'base' }
      );

      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return a.firstName.localeCompare(
        b.firstName,
        'fr',
        { sensitivity: 'base' }
      );
    });



  /* ---------------------------------------------------------
     ACTIVITÉS
     --------------------------------------------------------- */

  state.activities =
    activities
      .map((activity) => {

        const dayRow =
          days.get(
            refIds(
              activity.Jour
            )[0]
          );

        const startRow =
          hours.get(
            refIds(
              activity.Heure_debut
            )[0]
          );

        const endRow =
          hours.get(
            refIds(
              activity.Heure_fin
            )[0]
          );


        const animatorNames =
          refIds(
            activity.Animateur_s
          )
            .map(
              (id) =>
                animators.get(id)
            )
            .filter(Boolean)
            .map(
              (animator) =>
                text(
                  animator.Nom2,
                  `${text(
                    animator.Prenom
                  )} ${text(
                    animator.Nom
                  )}`.trim()
                )
            );


        /*
         * Nouvelles colonnes :
         *
         * Groupe ouvert
         * Année complète
         */

        const groupOpenValue =
          firstDefined(
            activity,
            [
              'Groupe_ouvert',
              'Groupe_Ouvert'
            ],
            false
          );

        const fullYearValue =
          firstDefined(
            activity,
            [
              'Annee_complete',
              'Annee_Complete',
              'Annee_complete_'
            ],
            false
          );


        return {
          id:
            activity.id,

          kind:
            'regular',

          name:
            text(
              activity.Nom_activite,
              'Activité'
            ),

          day:
            normalizeDay(
              dayRow?.Jour ||
              activity.gristHelper_Display2
            ),

          dayOrder:
            Number(
              activity.Jour_Num_jour ||
              dayRow?.Num_jour ||
              99
            ),

          start:
            text(
              startRow?.Heures ||
              activity.gristHelper_Display3
            ),

          end:
            text(
              endRow?.Heures ||
              activity.gristHelper_Display4
            ),

          animators:
            animatorNames,

          capacity:
            activity.Capacite,

          description:
            text(
              activity.Remarques_planning
            ).slice(0, 100),

          visual:
            activity.Visuel,

          groupOpen:
            isTrue(
              groupOpenValue
            ),

          fullYear:
            isTrue(
              fullYearValue
            ),

          participants:
            participantsByActivity.get(
              activity.id
            ) ||
            new Set()
        };
      })

      .sort(sortActivities);


  /* ---------------------------------------------------------
     ACTIVITÉS AUTRES / RÉÉDUCATIONS
     --------------------------------------------------------- */

  state.otherActivities =
    state.tables.reeducations
      .map((otherActivity) => {

        const typeRow =
          otherActivityTypes.get(
            refIds(
              otherActivity.Type
            )[0]
          );

        const dayRow =
          days.get(
            refIds(
              otherActivity.Jour
            )[0]
          );

        const partnerRow =
          partners.get(
            refIds(
              otherActivity.Partenaire
            )[0]
          );

        const userIds =
          refIds(
            otherActivity.Usagers
          );


        const typeName =
          text(
            typeRow?.Type ||
            otherActivity.gristHelper_Display,
            'Activité autre'
          );


        const partnerName =
          text(
            partnerRow?.Partenaire ||
            partnerRow?.Organisation ||
            otherActivity.gristHelper_Display4 ||
            otherActivity.gristHelper_Display6
          );


        const hourRow =
          hours.get(
            refIds(
              firstDefined(
                otherActivity,
                [
                  'Heure',
                  'Horaire'
                ]
              )
            )[0]
          );


        const rawSchedule =
          text(
            hourRow?.Heures ||
            firstDefined(
              otherActivity,
              [
                'Horaire',
                'gristHelper_Display3'
              ]
            )
          );


        const scheduleParts =
          rawSchedule
            .split(
              /\s*[–—-]\s*/
            )
            .filter(Boolean);


        return {
          id:
            otherActivity.id,

          kind:
            'other',

          name:
            typeName,

          day:
            normalizeDay(
              dayRow?.Jour ||
              otherActivity.gristHelper_Display2
            ),

          dayOrder:
            Number(
              dayRow?.Num_jour ||
              99
            ),

          start:
            scheduleParts[0] ||
            rawSchedule,

          end:
            scheduleParts[1] ||
            '',

          schedule:
            rawSchedule,

          partner:
            partnerName,

          place:
            text(
              otherActivity.Lieu
            ),

          description:
            '',

          visual:
            typeRow?.Visuel_act_autre,

          participants:
            new Set(userIds)
        };
      })

      .sort(sortActivities);
}


/* =========================================================
   TRI
   ========================================================= */

function sortActivities(a, b) {
  return (
    a.dayOrder -
      b.dayOrder ||

    minutes(a.start) -
      minutes(b.start) ||

    a.name.localeCompare(
      b.name,
      'fr'
    )
  );
}


/* =========================================================
   SÉLECTEUR D'USAGER
   ========================================================= */

function populatePeople() {
  $('personSelect').innerHTML =
    state.people
      .map(
        (person) =>
          `<option value="${person.id}">
            ${esc(person.name)}
          </option>`
      )
      .join('');
}


/* =========================================================
   MESSAGE D'ÉTAT
   ========================================================= */

function showStatus(
  message,
  error = false
) {
  $('status').textContent =
    message;

  $('status').classList.toggle(
    'error',
    error
  );

  $('status').classList.remove(
    'hidden'
  );

  $('sheet').classList.add(
    'hidden'
  );
}


/* =========================================================
   MATIN / APRÈS-MIDI
   ========================================================= */

function periodOf(activity) {
  return minutes(activity.start) <
    13 * 60
    ? 'Matin'
    : 'Après-midi';
}


/* =========================================================
   PRÉSENCE
   ========================================================= */

function isPresent(person, day) {
  return (
    person.presence.includes(day) ||

    person.flags[day] === true ||

    person.flags[day] === 1
  );
}


/* =========================================================
   Date d'impression
   ========================================================= */
function updatePrintDate() {
  const printDate = $('printDate');

  if (!printDate) {
    return;
  }

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long'
  }).format(new Date());

  printDate.textContent = `Imprimé le ${formattedDate}`;
}


/* =========================================================
   OPACITÉ
   ========================================================= */

function opacityFor(day) {
  const input =
    $(`opacity${day}`);

  const value =
    input
      ? Number(input.value)
      : 18;

  return (
    Math.min(
      100,
      Math.max(
        0,
        value
      )
    ) / 100
  );
}


/* =========================================================
   COULEURS
   ========================================================= */

function hexToRgba(
  hex,
  opacity
) {
  const normalized =
    hex.replace('#', '');

  const number =
    Number.parseInt(
      normalized,
      16
    );

  const red =
    (number >> 16) & 255;

  const green =
    (number >> 8) & 255;

  const blue =
    number & 255;

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}


/* =========================================================
   AFFICHAGE DU PLANNING
   ========================================================= */

async function render() {
  const person = state.people.find(
    (item) => item.id === Number(state.selectedId)
  );

  if (!person) {
    return;
  }

  $('status').classList.add('hidden');
  $('sheet').classList.remove('hidden');

  $('personName').textContent = person.name;

  const presentDays = DAYS.filter(
    (day) => isPresent(person, day)
  );

  $('presenceText').textContent = presentDays.length
    ? presentDays.join(', ')
    : 'Présence habituelle non renseignée';

  const portraitUrl = await attachmentUrl(person.portrait);

  $('portrait').innerHTML = portraitUrl
    ? `
      <img
        src="${portraitUrl}"
        alt="Portrait de ${esc(person.name)}"
      >
    `
    : `
      <span>
        ${esc(initials(person.name))}
      </span>
    `;

  const cards = await Promise.all(
    DAYS.map((day) => renderDay(person, day))
  );

  $('weekGrid').innerHTML = `
    ${cards.join('')}

    <div
      class="meal-banner"
      aria-label="Repas de 12 heures"
    >
      <span>
        12 h · Repas
      </span>
    </div>
  `;

  alignMealBanner();
  updatePrintDate();
  buildPrintSheet();
}



/* =========================================================
   AFFICHAGE D'UNE JOURNÉE

   ORDRE DE PRIORITÉ :

   1. USAGER ABSENT
      → aucune activité affichée.

   2. USAGER PRÉSENT + activité Année complète
      → activité inscrite affichée.
      → groupes ouverts masqués sur cette demi-journée.

   3. USAGER PRÉSENT + activité non Année complète
      → activité inscrite affichée.
      → groupes ouverts affichés.

   4. USAGER PRÉSENT + aucune inscription
      → groupes ouverts affichés.

   La logique est indépendante entre :
   - matin
   - après-midi
   ========================================================= */

async function renderDay(
  person,
  day
) {

  /*
   * On détermine immédiatement
   * si l'usager est présent.
   */

  const present =
    isPresent(
      person,
      day
    );


  /* ---------------------------------------------------------
     ACTIVITÉS AUXQUELLES L'USAGER EST INSCRIT
     --------------------------------------------------------- */

  const enrolledActivities =
    present
      ? state.activities.filter(
          (activity) => (
            activity.day === day &&
            activity.participants.has(
              person.id
            )
          )
        )
      : [];


  /* ---------------------------------------------------------
     GROUPE OUVERT
     --------------------------------------------------------- */

  function shouldShowOpenGroup(
    openActivity
  ) {

    /*
     * Si l'usager est absent :
     * aucun groupe ouvert.
     */

    if (!present) {
      return false;
    }


    const openPeriod =
      periodOf(
        openActivity
      );


    /*
     * Inscriptions de l'usager
     * sur la même demi-journée.
     */

    const enrolledSamePeriod =
      enrolledActivities.filter(
        (activity) =>
          periodOf(activity) ===
          openPeriod
      );


    /*
     * Aucune activité inscrite :
     * groupes ouverts proposés.
     */

    if (
      enrolledSamePeriod.length ===
      0
    ) {
      return true;
    }


    /*
     * Présence d'une activité
     * Année complète :
     *
     * groupes ouverts masqués.
     */

    const hasFullYearActivity =
      enrolledSamePeriod.some(
        (activity) =>
          activity.fullYear ===
          true
      );


    if (
      hasFullYearActivity
    ) {
      return false;
    }


    /*
     * Activité inscrite,
     * mais pas Année complète :
     *
     * groupes ouverts affichés.
     */

    return true;
  }


  /* ---------------------------------------------------------
     ACTIVITÉS ORDINAIRES
     --------------------------------------------------------- */

  const regularActivities =
    state.activities.filter(
      (activity) => {

        /*
         * PRIORITÉ ABSOLUE :
         *
         * usager absent =
         * aucune activité.
         */

        if (!present) {
          return false;
        }


        /*
         * Mauvais jour.
         */

        if (
          activity.day !== day
        ) {
          return false;
        }


        /*
         * L'usager est inscrit :
         * activité toujours affichée.
         */

        if (
          activity.participants.has(
            person.id
          )
        ) {
          return true;
        }


        /*
         * Pas inscrit
         * + groupe fermé :
         *
         * activité masquée.
         */

        if (
          !activity.groupOpen
        ) {
          return false;
        }


        /*
         * Groupe ouvert :
         * application de la règle
         * Année complète.
         */

        return shouldShowOpenGroup(
          activity
        );
      }
    );


  /* ---------------------------------------------------------
     RÉÉDUCATIONS / ACTIVITÉS AUTRES
     --------------------------------------------------------- */

  const otherActivities =
    state.otherActivities.filter(
      (activity) => (
        present &&
        activity.day === day &&
        activity.participants.has(
          person.id
        )
      )
    );


  /* ---------------------------------------------------------
     RASSEMBLEMENT
     --------------------------------------------------------- */

  const activities = [
    ...regularActivities,
    ...otherActivities
  ].sort(sortActivities);


  /* ---------------------------------------------------------
     MATIN / APRÈS-MIDI
     --------------------------------------------------------- */

  const groups = {
    Matin:
      activities.filter(
        (activity) =>
          periodOf(activity) ===
          'Matin'
      ),

    'Après-midi':
      activities.filter(
        (activity) =>
          periodOf(activity) ===
          'Après-midi'
      )
  };


  const showEmpty =
    $('showEmpty').checked;

  const sections = [];


  /* ---------------------------------------------------------
     CONSTRUCTION DES DEMI-JOURNÉES
     --------------------------------------------------------- */

  for (
    const label of [
      'Matin',
      'Après-midi'
    ]
  ) {

    const list =
      groups[label];


    /*
     * Si aucune activité et
     * que les créneaux vides
     * sont masqués.
     */

    if (
      !list.length &&
      !showEmpty
    ) {

      if (
        label === 'Matin'
      ) {
        sections.push(
          '<div class="meal-gap" aria-hidden="true"></div>'
        );
      }

      continue;
    }


    /*
     * Contenu de la demi-journée.
     */

    const inner =
      list.length
        ? (
            await Promise.all(
              list.map(
                activityCard
              )
            )
          ).join('')

        : `
          <div class="empty-slot">
            ${
              present
                ? 'Aucune activité renseignée'
                : 'Absent'
            }
          </div>
        `;


    sections.push(`
      <section
        class="period period-${label.toLowerCase()}"
      >

        <div class="period-title">
          ${label}
        </div>

        ${inner}

      </section>
    `);


    if (
      label === 'Matin'
    ) {
      sections.push(
        '<div class="meal-gap" aria-hidden="true"></div>'
      );
    }
  }


  /* ---------------------------------------------------------
     COULEUR DE LA JOURNÉE
     --------------------------------------------------------- */

  const dayColor =
    DAY_COLORS[day];

  const dayBackground =
    hexToRgba(
      dayColor,
      opacityFor(day)
    );

  const absenceClass =
    present
      ? ''
      : ' day-absent';


  /* ---------------------------------------------------------
     HTML DU JOUR
     --------------------------------------------------------- */

  return `
    <article
      class="day${absenceClass}"
      style="
        --day-color: ${dayColor};
        --day-background: ${dayBackground};
      "
    >

      <div class="day-head">

        <h3>
          ${day}
        </h3>

        <span>
          ${
            present
              ? `${activities.length} activité${
                  activities.length > 1
                    ? 's'
                    : ''
                }`
              : 'ABSENT·E'
          }
        </span>

      </div>

      <div class="day-content">

        ${sections.join('')}

      </div>

    </article>
  `;
}


/* =========================================================
   ALIGNEMENT DU BANDEAU REPAS
   ========================================================= */

function alignMealBanner() {
  const grid =
    $('weekGrid');

  const morningSections = [
    ...grid.querySelectorAll(
      '.period-matin'
    )
  ];

  const banner =
    grid.querySelector(
      '.meal-banner'
    );


  if (
    !morningSections.length ||
    !banner
  ) {
    return;
  }


  morningSections.forEach(
    (section) => {
      section.style.minHeight =
        '';
    }
  );


  const maxMorningHeight =
    Math.max(
      ...morningSections.map(
        (section) =>
          section
            .getBoundingClientRect()
            .height
      )
    );


  morningSections.forEach(
    (section) => {
      section.style.minHeight =
        `${maxMorningHeight}px`;
    }
  );


  const firstGap =
    grid.querySelector(
      '.meal-gap'
    );


  if (!firstGap) {
    return;
  }


  const gridRect =
    grid.getBoundingClientRect();

  const gapRect =
    firstGap.getBoundingClientRect();


  banner.style.top =
    `${
      gapRect.top -
      gridRect.top
    }px`;
}



/* =========================================================
   IMPRESSION ADAPTATIVE A4 / A3
   ========================================================= */

/*
 * L'impression utilise une page dédiée indépendante de la grille écran.
 * Pour chaque usager, le script cherche la plus grande taille de tuiles
 * qui tient réellement sur une seule page. Le bandeau d'identité et les
 * éléments structurants restent volontairement de taille fixe pour tous.
 *
 * Le coefficient -2 correspond au mode ultra, réservé aux cas exceptionnellement chargés.
 * Le coefficient -1 correspond au mode d'urgence très dense.
 * Le coefficient  0 correspond au mode compact (ancien niveau density-4).
 * Le coefficient  1 correspond au mode confort, nettement plus lisible.
 */
const PRINT_RATIO_MIN = -2;
const PRINT_RATIO_MAX = 1;
const PRINT_SEARCH_STEPS = 12;
const PRINT_SAFETY_RATIO = 0.985;

const PRINT_FORMATS = {
  a4: {
    pageSize: 'A4',
    margin: '8mm 6mm',
    widthMm: 285,
    heightMm: 194
  },
  a3: {
    pageSize: 'A3',
    margin: '9mm',
    widthMm: 402,
    heightMm: 279
  }
};

/*
 * Bornes de dimensions.
 * compact = dimensions proches de la version qui tient déjà pour les plannings chargés.
 * comfort = dimensions maximales visées pour les plannings légers.
 * emergency = uniquement si le mode compact ne suffit pas.
 * ultra = dernier filet de sécurité : seules les tuiles se réduisent davantage ;
 *         l'en-tête reste strictement identique à tous les autres plannings.
 */
const PRINT_METRICS = {
  ultra: {
    phHeight: 13.2,
    phGap: 3.2,
    phPadBottom: 0.8,
    portraitSize: 11.2,
    portraitBorder: 0.35,
    portraitRadius: 1.0,
    portraitFont: 11.5,
    identityGap: 2.0,
    kickerFont: 5.0,
    kickerMargin: 0.35,
    nameFont: 11.5,
    sublineFont: 4.8,
    sublineMargin: 0.35,
    logoWidth: 20.5,
    logoHeight: 9.0,
    weekHeight: 4.8,
    weekFont: 5.5,
    weekRadius: 0.9,
    gridDayHeight: 5.3,
    gridMealHeight: 3.9,
    gridColumnGap: 0.65,
    gridTopPad: 0.65,
    dayHeadPadX: 0.7,
    dayTitleFont: 6.2,
    dayCountFont: 3.9,
    periodPad: 0.38,
    periodTitleMargin: 0.25,
    periodTitleFont: 4.10,
    cardGap: 0.18,
    cardPadY: 0.32,
    cardPadLeft: 0.42,
    cardBorder: 0.25,
    cardRadius: 0.65,
    activityTitleFont: 4.85,
    activityTitleMargin: 0.18,
    activityTimeFont: 3.85,
    activityTimePadY: 0.12,
    activityTimePadX: 0.35,
    activityMetaFont: 3.55,
    activityMetaMargin: 0.18,
    activityMetaLine: 1.00,
    activityDescFont: 3.25,
    activityDescMargin: 0.15,
    activityDescLine: 1.00,
    activityLogoSize: 5.0,
    activityLogoOffset: 0.35,
    emptyMinHeight: 4.5,
    emptyPad: 0.35,
    emptyFont: 3.8,
    mealFont: 5.0,
    mealMargin: 0.28,
    footHeight: 3.3,
    footFont: 3.95,
    footPadTop: 0.45
  },

  emergency: {
    phHeight: 13.2,
    phGap: 3.2,
    phPadBottom: 0.8,
    portraitSize: 11.2,
    portraitBorder: 0.35,
    portraitRadius: 1.0,
    portraitFont: 11.5,
    identityGap: 2.0,
    kickerFont: 5.0,
    kickerMargin: 0.35,
    nameFont: 11.5,
    sublineFont: 4.8,
    sublineMargin: 0.35,
    logoWidth: 20.5,
    logoHeight: 9.0,
    weekHeight: 4.8,
    weekFont: 5.5,
    weekRadius: 0.9,
    gridDayHeight: 5.3,
    gridMealHeight: 3.9,
    gridColumnGap: 0.65,
    gridTopPad: 0.65,
    dayHeadPadX: 0.7,
    dayTitleFont: 6.2,
    dayCountFont: 3.9,
    periodPad: 0.48,
    periodTitleMargin: 0.35,
    periodTitleFont: 4.55,
    cardGap: 0.28,
    cardPadY: 0.42,
    cardPadLeft: 0.50,
    cardBorder: 0.30,
    cardRadius: 0.75,
    activityTitleFont: 5.25,
    activityTitleMargin: 0.24,
    activityTimeFont: 4.15,
    activityTimePadY: 0.15,
    activityTimePadX: 0.42,
    activityMetaFont: 3.9,
    activityMetaMargin: 0.22,
    activityMetaLine: 1.03,
    activityDescFont: 3.55,
    activityDescMargin: 0.20,
    activityDescLine: 1.02,
    activityLogoSize: 5.8,
    activityLogoOffset: 0.42,
    emptyMinHeight: 5.2,
    emptyPad: 0.45,
    emptyFont: 4.1,
    mealFont: 5.0,
    mealMargin: 0.28,
    footHeight: 3.3,
    footFont: 3.95,
    footPadTop: 0.45
  },

  compact: {
    phHeight: 14.0,
    phGap: 3.6,
    phPadBottom: 0.9,
    portraitSize: 12.0,
    portraitBorder: 0.38,
    portraitRadius: 1.0,
    portraitFont: 12.0,
    identityGap: 2.2,
    kickerFont: 5.2,
    kickerMargin: 0.45,
    nameFont: 12.4,
    sublineFont: 5.0,
    sublineMargin: 0.45,
    logoWidth: 22.0,
    logoHeight: 10.0,
    weekHeight: 5.2,
    weekFont: 5.8,
    weekRadius: 1.0,
    gridDayHeight: 5.8,
    gridMealHeight: 4.3,
    gridColumnGap: 0.85,
    gridTopPad: 0.8,
    dayHeadPadX: 0.85,
    dayTitleFont: 6.8,
    dayCountFont: 4.2,
    periodPad: 0.58,
    periodTitleMargin: 0.45,
    periodTitleFont: 4.9,
    cardGap: 0.38,
    cardPadY: 0.55,
    cardPadLeft: 0.65,
    cardBorder: 0.35,
    cardRadius: 0.85,
    activityTitleFont: 5.7,
    activityTitleMargin: 0.30,
    activityTimeFont: 4.6,
    activityTimePadY: 0.20,
    activityTimePadX: 0.50,
    activityMetaFont: 4.25,
    activityMetaMargin: 0.28,
    activityMetaLine: 1.04,
    activityDescFont: 3.9,
    activityDescMargin: 0.25,
    activityDescLine: 1.03,
    activityLogoSize: 6.6,
    activityLogoOffset: 0.50,
    emptyMinHeight: 5.8,
    emptyPad: 0.55,
    emptyFont: 4.4,
    mealFont: 5.4,
    mealMargin: 0.35,
    footHeight: 3.6,
    footFont: 4.2,
    footPadTop: 0.55
  },

  comfort: {
    phHeight: 18.2,
    phGap: 5.4,
    phPadBottom: 1.6,
    portraitSize: 16.2,
    portraitBorder: 0.48,
    portraitRadius: 1.5,
    portraitFont: 14.0,
    identityGap: 3.3,
    kickerFont: 6.9,
    kickerMargin: 0.9,
    nameFont: 17.0,
    sublineFont: 6.3,
    sublineMargin: 0.9,
    logoWidth: 28.0,
    logoHeight: 13.0,
    weekHeight: 6.6,
    weekFont: 7.2,
    weekRadius: 1.3,
    gridDayHeight: 8.0,
    gridMealHeight: 5.9,
    gridColumnGap: 1.65,
    gridTopPad: 1.35,
    dayHeadPadX: 1.55,
    dayTitleFont: 9.1,
    dayCountFont: 5.5,
    periodPad: 1.55,
    periodTitleMargin: 1.15,
    periodTitleFont: 7.2,
    cardGap: 1.20,
    cardPadY: 1.45,
    cardPadLeft: 1.50,
    cardBorder: 0.52,
    cardRadius: 1.35,
    activityTitleFont: 10.4,
    activityTitleMargin: 0.78,
    activityTimeFont: 7.8,
    activityTimePadY: 0.42,
    activityTimePadX: 1.0,
    activityMetaFont: 7.0,
    activityMetaMargin: 0.82,
    activityMetaLine: 1.15,
    activityDescFont: 6.2,
    activityDescMargin: 0.70,
    activityDescLine: 1.10,
    activityLogoSize: 14.8,
    activityLogoOffset: 1.0,
    emptyMinHeight: 12.0,
    emptyPad: 1.4,
    emptyFont: 6.9,
    mealFont: 7.4,
    mealMargin: 0.65,
    footHeight: 4.6,
    footFont: 5.0,
    footPadTop: 0.9
  }
};

/*
 * Dimensions structurelles fixes pour toutes les impressions.
 * Elles ne sont jamais interpolées avec la densité du planning.
 */
const PRINT_FIXED_MM = [
  ['--ph-height', 19.0],
  ['--ph-gap', 5.0],
  ['--ph-pad-bottom', 1.0],
  ['--portrait-size', 17.0],
  ['--portrait-border', 0.50],
  ['--portrait-radius', 1.60],
  ['--identity-gap', 3.50],
  ['--kicker-margin', 0.75],
  ['--subline-margin', 0.70],
  ['--logo-width', 27.0],
  ['--logo-height', 12.0],
  ['--week-height', 6.0],
  ['--week-radius', 1.20],
  ['--grid-day-height', 8.50],
  ['--grid-column-gap', 1.00],
  ['--grid-top-pad', 0.90],
  ['--day-head-pad-x', 1.10],
  ['--grid-meal-height', 6.50],
  ['--meal-margin', 0.35],
  ['--foot-height', 3.80],
  ['--foot-pad-top', 0.55]
];

const PRINT_FIXED_PT = [
  ['--portrait-font', 14.5],
  ['--kicker-font', 6.5],
  ['--name-font', 16.0],
  ['--subline-font', 5.8],
  ['--week-font', 6.6],
  ['--day-title-font', 10.0],
  ['--day-count-font', 4.7],
  ['--meal-font', 8.0],
  ['--foot-font', 4.3]
];

function lerp(
  start,
  end,
  ratio
) {
  return start +
    (end - start) * ratio;
}

function printMetric(
  name,
  ratio
) {
  if (ratio >= 0) {
    return lerp(
      PRINT_METRICS.compact[name],
      PRINT_METRICS.comfort[name],
      Math.min(1, ratio)
    );
  }

  if (ratio >= -1) {
    return lerp(
      PRINT_METRICS.emergency[name],
      PRINT_METRICS.compact[name],
      Math.max(0, ratio + 1)
    );
  }

  return lerp(
    PRINT_METRICS.ultra[name],
    PRINT_METRICS.emergency[name],
    Math.max(0, Math.min(1, ratio + 2))
  );
}

function setPrintVariable(
  name,
  value,
  unit = ''
) {
  const printSheet = $('printSheet');
  if (!printSheet) return;

  printSheet.style.setProperty(
    name,
    `${Number(value).toFixed(3)}${unit}`
  );
}

function applyPrintMetrics(
  ratio
) {
  const printSheet = $('printSheet');
  if (!printSheet) return;

  /*
   * Variables réellement adaptatives : uniquement le contenu des
   * demi-journées et des tuiles d'activités.
   */
  const mm = [
    ['--period-pad', 'periodPad'],
    ['--period-title-margin', 'periodTitleMargin'],
    ['--card-gap', 'cardGap'],
    ['--card-pad-y', 'cardPadY'],
    ['--card-pad-left', 'cardPadLeft'],
    ['--card-border', 'cardBorder'],
    ['--card-radius', 'cardRadius'],
    ['--activity-title-margin', 'activityTitleMargin'],
    ['--activity-time-pad-y', 'activityTimePadY'],
    ['--activity-time-pad-x', 'activityTimePadX'],
    ['--activity-meta-margin', 'activityMetaMargin'],
    ['--activity-desc-margin', 'activityDescMargin'],
    ['--activity-logo-size', 'activityLogoSize'],
    ['--activity-logo-offset', 'activityLogoOffset'],
    ['--empty-min-height', 'emptyMinHeight'],
    ['--empty-pad', 'emptyPad']
  ];

  const pt = [
    ['--period-title-font', 'periodTitleFont'],
    ['--activity-title-font', 'activityTitleFont'],
    ['--activity-time-font', 'activityTimeFont'],
    ['--activity-meta-font', 'activityMetaFont'],
    ['--activity-desc-font', 'activityDescFont'],
    ['--empty-font', 'emptyFont']
  ];

  for (const [variable, metric] of mm) {
    setPrintVariable(
      variable,
      printMetric(metric, ratio),
      'mm'
    );
  }

  for (const [variable, metric] of pt) {
    setPrintVariable(
      variable,
      printMetric(metric, ratio),
      'pt'
    );
  }

  setPrintVariable(
    '--activity-meta-line',
    printMetric('activityMetaLine', ratio)
  );

  setPrintVariable(
    '--activity-desc-line',
    printMetric('activityDescLine', ratio)
  );

  /*
   * La structure est réappliquée à chaque essai afin qu'une recherche de
   * densité ne puisse jamais réduire le bandeau d'identité ou les bandeaux.
   */
  for (const [variable, value] of PRINT_FIXED_MM) {
    setPrintVariable(variable, value, 'mm');
  }

  for (const [variable, value] of PRINT_FIXED_PT) {
    setPrintVariable(variable, value, 'pt');
  }

  const logoSize =
    printMetric(
      'activityLogoSize',
      ratio
    );

  const rightPadding =
    logoSize +
    Math.max(
      1.3,
      printMetric(
        'activityLogoOffset',
        ratio
      ) * 2 + 0.6
    );

  setPrintVariable(
    '--card-pad-right',
    rightPadding,
    'mm'
  );

  printSheet.dataset.printRatio =
    ratio.toFixed(3);

  printSheet.dataset.printMode =
    ratio >= 0.72
      ? 'confort-max'
      : ratio >= 0.35
        ? 'confort'
        : ratio >= 0.05
          ? 'standard'
          : ratio >= 0
            ? 'compact'
            : ratio >= -1
              ? 'urgence'
              : 'ultra';
}

function currentPrintFormat() {
  return (
    $('formatSelect')?.value === 'a3'
      ? 'a3'
      : 'a4'
  );
}

function applyPrintPageRule() {
  const format =
    PRINT_FORMATS[
      currentPrintFormat()
    ];

  let style =
    $('dynamicPrintPageRule');

  if (!style) {
    style = document.createElement(
      'style'
    );
    style.id =
      'dynamicPrintPageRule';
    document.head.appendChild(
      style
    );
  }

  style.textContent = `
    @page {
      size: ${format.pageSize} landscape;
      margin: ${format.margin};
    }
  `;

  const printSheet =
    $('printSheet');

  if (printSheet) {
    printSheet.style.setProperty(
      '--print-page-width',
      `${format.widthMm}mm`
    );

    printSheet.style.setProperty(
      '--print-page-height',
      `${format.heightMm}mm`
    );
  }
}

function printPeriodMarkup(
  period,
  label
) {
  if (period) {
    return period.innerHTML;
  }

  return `
    <div class="period-title">
      ${esc(label)}
    </div>
  `;
}

function buildPrintSheet() {
  const printSheet =
    $('printSheet');

  const weekGrid =
    $('weekGrid');

  if (
    !printSheet ||
    !weekGrid
  ) {
    return;
  }

  const dayArticles = [
    ...weekGrid.querySelectorAll(
      ':scope > .day'
    )
  ];

  if (!dayArticles.length) {
    printSheet.innerHTML = '';
    return;
  }

  const portraitHtml =
    $('portrait')?.innerHTML ||
    '<span>?</span>';

  const personName =
    $('personName')?.textContent ||
    '—';

  const presence =
    $('presenceText')?.textContent ||
    '';

  const printDate =
    $('printDate')?.textContent ||
    '';

  const logoSrc =
    $('siteLogo')?.getAttribute(
      'src'
    ) ||
    'logo.png';

  const headerCells = [];
  const morningCells = [];
  const afternoonCells = [];

  for (
    let index = 0;
    index < DAYS.length;
    index += 1
  ) {
    const day = DAYS[index];
    const article =
      dayArticles[index];

    const dayColor =
      article?.style.getPropertyValue(
        '--day-color'
      ) ||
      DAY_COLORS[day];

    const dayBackground =
      article?.style.getPropertyValue(
        '--day-background'
      ) ||
      hexToRgba(
        DAY_COLORS[day],
        opacityFor(day)
      );

    const dayHead =
      article?.querySelector(
        '.day-head'
      );

    const dayCount =
      dayHead?.querySelector('span')
        ?.textContent ||
      '';

    const periods = article
      ? [
          ...article.querySelectorAll(
            '.period'
          )
        ]
      : [];

    const morning =
      periods.find(
        (period) =>
          period.classList.contains(
            'period-matin'
          )
      ) ||
      null;

    const afternoon =
      periods.find(
        (period) =>
          !period.classList.contains(
            'period-matin'
          )
      ) ||
      null;

    const absentClass =
      article?.classList.contains(
        'day-absent'
      )
        ? ' is-absent'
        : '';

    const cssVars =
      `--day-color:${dayColor};` +
      `--day-background:${dayBackground};`;

    headerCells.push(`
      <div
        class="print-day-head"
        style="${cssVars}"
      >
        <h3>${esc(day)}</h3>
        <span>${esc(dayCount)}</span>
      </div>
    `);

    morningCells.push(`
      <section
        class="print-period print-morning${absentClass}"
        style="${cssVars}"
      >
        ${printPeriodMarkup(
          morning,
          'Matin'
        )}
      </section>
    `);

    afternoonCells.push(`
      <section
        class="print-period print-afternoon${absentClass}"
        style="${cssVars}"
      >
        ${printPeriodMarkup(
          afternoon,
          'Après-midi'
        )}
      </section>
    `);
  }

  printSheet.className =
    'print-sheet';

  printSheet.innerHTML = `
    <header class="print-page-head">
      <div class="print-page-identity">
        <div class="print-page-portrait">
          ${portraitHtml}
        </div>

        <div class="print-page-titles">
          <p class="print-page-kicker">
            SAJ Anagallis - Planning 2026-27
          </p>
          <h1 class="print-page-name">
            ${esc(personName)}
          </h1>
          <div class="print-page-subline">
            ${esc(presence)}
            ${
              printDate
                ? ` - ${esc(printDate)}`
                : ''
            }
          </div>
        </div>
      </div>

      <img
        class="print-page-logo"
        src="${esc(logoSrc)}"
        alt="Logo du service"
      >
    </header>

    <div class="print-planning-grid">
      ${headerCells.join('')}
      ${morningCells.join('')}

      <div class="print-meal-row">
        12 h - Repas
      </div>

      ${afternoonCells.join('')}
    </div>

    <footer class="print-page-foot">
      Odynéo - Les Tourrais de Craponne - Service d'accueil de Jour Anagallis.
    </footer>
  `;
}

function requiredPeriodHeight(
  cell
) {
  if (!cell) return 0;

  const cellRect =
    cell.getBoundingClientRect();

  const style =
    getComputedStyle(cell);

  const paddingBottom =
    Number.parseFloat(
      style.paddingBottom
    ) || 0;

  const lastChild =
    cell.lastElementChild;

  if (!lastChild) {
    return (
      (Number.parseFloat(
        style.paddingTop
      ) || 0) +
      paddingBottom
    );
  }

  const lastRect =
    lastChild.getBoundingClientRect();

  return Math.max(
    0,
    lastRect.bottom -
      cellRect.top +
      paddingBottom
  );
}

function balancePrintPeriodRows() {
  const printSheet =
    $('printSheet');

  if (!printSheet) return;

  /*
   * Une première mesure à 50/50 permet de connaître la hauteur réellement
   * nécessaire au contenu de chaque demi-journée, indépendamment du nombre
   * total d'activités de la semaine.
   */
  printSheet.style.setProperty(
    '--print-morning-track',
    '1fr'
  );

  printSheet.style.setProperty(
    '--print-afternoon-track',
    '1fr'
  );

  void printSheet.offsetHeight;

  const mornings = [
    ...printSheet.querySelectorAll(
      '.print-morning'
    )
  ];

  const afternoons = [
    ...printSheet.querySelectorAll(
      '.print-afternoon'
    )
  ];

  const morningNeed =
    Math.max(
      1,
      ...mornings.map(
        requiredPeriodHeight
      )
    );

  const afternoonNeed =
    Math.max(
      1,
      ...afternoons.map(
        requiredPeriodHeight
      )
    );

  const totalNeed =
    morningNeed +
    afternoonNeed;

  let morningShare =
    morningNeed /
    totalNeed;

  /*
   * On évite qu'une demi-journée très légère écrase totalement l'autre.
   * 27 % / 73 % est le compromis retenu pour garder une structure lisible.
   */
  morningShare =
    Math.min(
      0.73,
      Math.max(
        0.27,
        morningShare
      )
    );

  const afternoonShare =
    1 - morningShare;

  printSheet.style.setProperty(
    '--print-morning-track',
    `${morningShare.toFixed(4)}fr`
  );

  printSheet.style.setProperty(
    '--print-afternoon-track',
    `${afternoonShare.toFixed(4)}fr`
  );

  printSheet.dataset.morningShare =
    morningShare.toFixed(3);

  printSheet.dataset.afternoonShare =
    afternoonShare.toFixed(3);

  void printSheet.offsetHeight;
}

function printLayoutFits() {
  const printSheet =
    $('printSheet');

  if (!printSheet) {
    return true;
  }

  const tolerance = 1.5;

  const pageRect =
    printSheet.getBoundingClientRect();

  const pageOverflow =
    printSheet.scrollHeight >
      printSheet.clientHeight +
        tolerance ||
    printSheet.scrollWidth >
      printSheet.clientWidth +
        tolerance;

  const grid =
    printSheet.querySelector(
      '.print-planning-grid'
    );

  const gridOverflow =
    grid
      ? (
          grid.scrollHeight >
            grid.clientHeight +
              tolerance ||
          grid.scrollWidth >
            grid.clientWidth +
              tolerance
        )
      : false;

  const periods = [
    ...printSheet.querySelectorAll(
      '.print-period'
    )
  ];

  const periodOverflow =
    periods.some(
      (cell) => {
        const cellRect =
          cell.getBoundingClientRect();

        const required =
          requiredPeriodHeight(
            cell
          );

        const verticalOverflow =
          required >
            cell.clientHeight -
              tolerance;

        const horizontalOverflow =
          cell.scrollWidth >
            cell.clientWidth +
              tolerance;

        const outsidePage =
          cellRect.bottom >
            pageRect.bottom +
              tolerance ||
          cellRect.right >
            pageRect.right +
              tolerance;

        return (
          verticalOverflow ||
          horizontalOverflow ||
          outsidePage
        );
      }
    );

  const header =
    printSheet.querySelector(
      '.print-page-head'
    );

  const headerOverflow =
    header
      ? (
          header.scrollHeight >
            header.clientHeight +
              tolerance ||
          header.scrollWidth >
            header.clientWidth +
              tolerance
        )
      : false;

  const footer =
    printSheet.querySelector(
      '.print-page-foot'
    );

  const footerOutsidePage =
    footer
      ? footer
          .getBoundingClientRect()
          .bottom >
        pageRect.bottom +
          tolerance
      : false;

  return !(
    pageOverflow ||
    gridOverflow ||
    periodOverflow ||
    headerOverflow ||
    footerOutsidePage
  );
}

function testPrintRatio(
  ratio
) {
  applyPrintMetrics(
    ratio
  );

  balancePrintPeriodRows();

  /* Force un recalcul complet avant le contrôle des débordements. */
  void $('printSheet')?.offsetHeight;

  return printLayoutFits();
}

function chooseAdaptivePrintSize() {
  const printSheet =
    $('printSheet');

  if (!printSheet) {
    return;
  }

  applyPrintPageRule();

  document.body.classList.add(
    'print-measure'
  );

  let low =
    PRINT_RATIO_MIN;

  let high =
    PRINT_RATIO_MAX;

  let best =
    PRINT_RATIO_MIN;

  /*
   * Si même le mode d'urgence ne rentrait pas, on le conserve quand même :
   * c'est la taille minimale autorisée. Dans les données actuelles, le mode
   * compact précédent tient déjà, donc cette branche n'est qu'une sécurité.
   */
  if (testPrintRatio(low)) {
    for (
      let step = 0;
      step < PRINT_SEARCH_STEPS;
      step += 1
    ) {
      const middle =
        (low + high) / 2;

      if (testPrintRatio(middle)) {
        best = middle;
        low = middle;
      } else {
        high = middle;
      }
    }
  } else {
    best =
      PRINT_RATIO_MIN;
  }

  /*
   * Marge de sûreté pour les légères différences de métriques entre
   * l'aperçu écran et le moteur d'impression de Firefox / Chromium.
   */
  const safeBest =
    best > 0
      ? best *
        PRINT_SAFETY_RATIO
      : best;

  applyPrintMetrics(
    safeBest
  );

  balancePrintPeriodRows();

  document.body.classList.remove(
    'print-measure'
  );

  console.info(
    '[Planning individuel] Impression adaptative',
    {
      personne:
        $('personName')?.textContent || '',
      format:
        currentPrintFormat(),
      ratio:
        Number(
          safeBest.toFixed(3)
        ),
      mode:
        printSheet.dataset.printMode,
      matin:
        printSheet.dataset.morningShare,
      apresMidi:
        printSheet.dataset.afternoonShare,
      enteteFixe: '19mm',
      portraitFixe: '17mm',
      nomFixe: '16pt'
    }
  );
}

function waitForPrintImages(
  timeout = 1800
) {
  const printSheet =
    $('printSheet');

  if (!printSheet) {
    return Promise.resolve();
  }

  const images = [
    ...printSheet.querySelectorAll(
      'img'
    )
  ];

  const pending = images
    .filter(
      (image) => !image.complete
    )
    .map(
      (image) =>
        new Promise(
          (resolve) => {
            const done = () => {
              image.removeEventListener(
                'load',
                done
              );

              image.removeEventListener(
                'error',
                done
              );

              resolve();
            };

            image.addEventListener(
              'load',
              done,
              { once: true }
            );

            image.addEventListener(
              'error',
              done,
              { once: true }
            );
          }
        )
    );

  if (!pending.length) {
    return Promise.resolve();
  }

  return Promise.race([
    Promise.all(pending),
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          timeout
        )
    )
  ]);
}

async function waitForPrintFonts() {
  if (!document.fonts?.ready) {
    return;
  }

  try {
    await document.fonts.ready;
  } catch (_) {
    /* Une police système reste utilisable si FontFaceSet n'est pas disponible. */
  }
}

async function preparePrintLayout() {
  updatePrintDate();
  applyPrintPageRule();
  buildPrintSheet();

  await Promise.all([
    waitForPrintImages(),
    waitForPrintFonts()
  ]);

  chooseAdaptivePrintSize();
}

/* =========================================================
   CARTE ACTIVITÉ
   ========================================================= */

async function activityCard(
  activity
) {
  const logo =
    await attachmentUrl(
      activity.visual
    );


  const time =
    activity.schedule ||
    [
      activity.start,
      activity.end
    ]
      .filter(Boolean)
      .join(' – ');


  const cardColor =
    colorFor(
      activity.name
    );


  const regularMeta =
    activity.kind === 'regular' &&
    activity.animators.length
      ? `
        <div>
          <strong>Avec :</strong>
          ${esc(
            activity.animators.join(
              ', '
            )
          )}
        </div>
      `
      : '';


  const otherMeta =
    activity.kind === 'other'
      ? `
        ${
          activity.partner &&
          activity.partner.trim()
            ? `
              <div>
                <strong>Avec :</strong>
                ${esc(
                  activity.partner
                )}
              </div>
            `
            : ''
        }

        ${
          activity.place &&
          activity.place.trim()
            ? `
              <div>
                <strong>Lieu :</strong>
                ${esc(
                  activity.place
                )}
              </div>
            `
            : ''
        }
      `
      : '';


  return `
    <article
      class="
        activity-card
        ${
          activity.kind === 'other'
            ? ' activity-card-other'
            : ''
        }
      "
      style="
        --card-color: ${cardColor}
      "
    >

      ${
        logo
          ? `
            <img
              class="activity-logo"
              src="${logo}"
              alt=""
            >
          `
          : ''
      }

      <h4 class="activity-title">
        ${esc(
          activity.name
        )}
      </h4>

      ${
        time
          ? `
            <div class="activity-time">
              ${esc(time)}
            </div>
          `
          : ''
      }

      <div class="activity-meta">

        ${regularMeta}

        ${otherMeta}

      </div>

      ${
        activity.description
          ? `
            <p class="activity-desc">
              ${esc(
                activity.description.slice(
                  0,
                  100
                )
              )}
            </p>
          `
          : ''
      }

    </article>
  `;
}


/* =========================================================
   ERREURS
   ========================================================= */

function showError(error) {
  console.error(error);

  showStatus(
    'Une erreur empêche l’affichage du planning.',
    true
  );


  $('errorText').textContent =
    `${error?.message || error}\n\n` +
    'Vérifiez que les tables portent exactement ces noms :\n' +
    Object.values(TABLES)
      .join('\n');


  $('errorDialog').showModal();
}


/* =========================================================
   ÉVÉNEMENTS
   ========================================================= */

$('personSelect')
  .addEventListener(
    'change',
    (event) => {

      state.selectedId =
        Number(
          event.target.value
        );

      render()
        .catch(showError);
    }
  );


$('showEmpty')
  .addEventListener(
    'change',
    () => {
      render()
        .catch(showError);
    }
  );


$('formatSelect')
  .addEventListener(
    'change',
    (event) => {

      document.body.classList.toggle(
        'print-a3',
        event.target.value === 'a3'
      );

      applyPrintPageRule();
    }
  );


for (const day of DAYS) {
  $(`opacity${day}`)
    .addEventListener(
      'input',
      () => {
        render()
          .catch(showError);
      }
    );
}


$('printBtn')
  .addEventListener(
    'click',
    async () => {
      await preparePrintLayout();
      window.print();
    }
  );


$('reloadBtn')
  .addEventListener(
    'click',
    () => {
      fetchAll()
        .catch(showError);
    }
  );


window.addEventListener(
  'beforeprint',
  () => {
    updatePrintDate();
    applyPrintPageRule();
    buildPrintSheet();
    chooseAdaptivePrintSize();
  }
);


/* =========================================================
   INITIALISATION GRIST
   ========================================================= */

grist.ready({
  requiredAccess: 'full'
});


grist.onOptions(
  (_options, interaction) => {

    if (
      interaction?.access_level &&
      interaction.access_level !==
        'full'
    ) {

      showStatus(
        'Autorisez « Accès complet au document » pour lire les tables liées.',
        true
      );
    }
  }
);


/* =========================================================
   DÉMARRAGE
   ========================================================= */

fetchAll()
  .catch(showError);