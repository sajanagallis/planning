'use strict';


/* ============================================================
   PLANNING COLLECTIF
   SAJ ANAGALLIS
   ============================================================ */


/* ============================================================
   JOURS
   ============================================================ */

const DAYS = [

  {
    name: 'Lundi',
    key: 'monday',
    color: '#FF69B4'
  },

  {
    name: 'Mardi',
    key: 'tuesday',
    color: '#009929'
  },

  {
    name: 'Mercredi',
    key: 'wednesday',
    color: '#0000FF'
  },

  {
    name: 'Jeudi',
    key: 'thursday',
    color: '#FF0000'
  },

  {
    name: 'Vendredi',
    key: 'friday',
    color: '#800080'
  }

];


/* ============================================================
   TABLES GRIST
   ============================================================ */

const TABLES = {

  participations:
    'Participations',

  activities:
    'Activites',

  users:
    'Usagers',

  days:
    'Jours_de_la_semaine',

  hours:
    'Heures',

  animateurs:
    'Animateurs'

};


/* ============================================================
   ÉTAT
   ============================================================ */

let state = {

  participations: [],

  activities: [],

  users: [],

  days: [],

  hours: [],

  animateurs: []

};


let attachmentTokenInfo = null;

const attachmentCache =
  new Map();


/* ============================================================
   OUTILS
   ============================================================ */

function normalize(value) {

  return String(
    value ?? ''
  ).trim();

}


function get(
  row,
  ...names
) {

  for (
    const name
    of names
  ) {

    if (
      row &&
      row[name] !== undefined &&
      row[name] !== null &&
      row[name] !== ''
    ) {

      return row[name];

    }

  }

  return '';

}


/* ============================================================
   TABLE GRIST → LIGNES
   ============================================================ */

function rowsFromTable(table) {

  if (
    !table ||
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
          column,
          values
        ]
        of Object.entries(table)
      ) {

        row[column] =
          Array.isArray(values)
            ? values[index]
            : values;

      }


      return row;

    }
  );

}


/* ============================================================
   RÉFÉRENCES GRIST
   ============================================================ */

function listIds(value) {

  if (
    Array.isArray(value)
  ) {

    const list =
      (
        value[0] === 'L' ||
        value[0] === 'l'
      )
        ? value.slice(1)
        : value;


    return list
      .flat()
      .map(Number)
      .filter(Number.isFinite);

  }


  const number =
    Number(value);


  if (
    Number.isFinite(number) &&
    number !== 0
  ) {

    return [number];

  }


  return [];

}


function firstId(value) {

  return (
    listIds(value)[0]
    ??
    null
  );

}


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
   HEURES
   ============================================================ */

function minutes(value) {

  const text =
    normalize(value);


  const match =
    text.match(
      /(\d{1,2})\s*[:h]\s*(\d{2})/i
    );


  if (!match) {

    return 9999;

  }


  return (
    Number(match[1]) * 60
    +
    Number(match[2])
  );

}


function referenceText(
  value,
  rows,
  names
) {

  const id =
    firstId(value);


  if (!id) {

    return normalize(value);

  }


  const row =
    byId(rows).get(id);


  if (!row) {

    return '';

  }


  return normalize(
    get(
      row,
      ...names
    )
  );

}


/* ============================================================
   JOUR DE L'ACTIVITÉ
   ============================================================ */

function activityDay(activity) {

  const helper =
    normalize(
      get(
        activity,
        'gristHelper_Display2'
      )
    );


  if (helper) {

    return helper;

  }


  return referenceText(

    get(
      activity,
      'Jour'
    ),

    state.days,

    [
      'Jour'
    ]

  );

}


/* ============================================================
   HEURE DE L'ACTIVITÉ
   ============================================================ */

function activityHour(
  activity,
  start = true
) {

  const helper =
    start
      ? 'gristHelper_Display3'
      : 'gristHelper_Display4';


  const column =
    start
      ? 'Heure_debut'
      : 'Heure_fin';


  const displayed =
    normalize(
      get(
        activity,
        helper
      )
    );


  if (displayed) {

    return displayed;

  }


  return referenceText(

    get(
      activity,
      column
    ),

    state.hours,

    [
      'Heures'
    ]

  );

}


/* ============================================================
   NOM USAGER
   ============================================================ */

function userName(user) {

  if (!user) {

    return '';

  }


  const display =
    normalize(
      get(
        user,
        'Usager'
      )
    );


  if (display) {

    return display;

  }


  const prenom =
    normalize(
      get(
        user,
        'Prenom',
        'Prénom'
      )
    );


  const nom =
    normalize(
      get(
        user,
        'Nom'
      )
    );


  return (
    `${prenom} ${nom}`
  ).trim();

}


function firstName(user) {

  return (

    normalize(
      get(
        user,
        'Prenom',
        'Prénom'
      )
    )

    ||

    userName(user)

  );

}


/* ============================================================
   INITIALES
   ============================================================ */

function initials(name) {

  return normalize(name)

    .split(/\s+/)

    .filter(Boolean)

    .slice(0, 2)

    .map(
      word =>
        word
          .charAt(0)
          .toUpperCase()
    )

    .join('');

}


/* ============================================================
   IMAGES GRIST
   ============================================================ */

async function attachmentUrl(value) {

  const id =
    listIds(value)[0];


  if (!id) {

    return '';

  }


  if (
    attachmentCache.has(id)
  ) {

    return attachmentCache.get(id);

  }


  try {

    if (
      !attachmentTokenInfo
    ) {

      attachmentTokenInfo =
        await grist.docApi
          .getAccessToken({

            readOnly: true

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


    attachmentCache.set(
      id,
      url
    );


    return url;

  }

  catch (error) {

    console.error(
      'Impossible de charger la pièce jointe',
      id,
      error
    );


    return '';

  }

}


/* ============================================================
   PARTICIPANTS D'UNE ACTIVITÉ
   ============================================================ */

function participantsForActivity(
  activityId
) {

  const ids =
    new Set();


  state.participations
    .forEach(
      participation => {

        const linkedActivity =
          firstId(
            get(
              participation,
              'Activites'
            )
          );


        if (
          Number(linkedActivity)
          !==
          Number(activityId)
        ) {

          return;

        }


        listIds(
          get(
            participation,
            'Participants'
          )
        )
        .forEach(
          id =>
            ids.add(
              Number(id)
            )
        );

      }
    );


  const users =
    byId(
      state.users
    );


  return [...ids]

    .map(
      id =>
        users.get(id)
    )

    .filter(Boolean)

    .sort(
      (
        a,
        b
      ) => {
        const nomA =
          normalize(
            get(
              a,
              'Nom'
            )
          );

        const nomB =
          normalize(
            get(
              b,
              'Nom'
            )
          );

        const comparaisonNom =
          nomA.localeCompare(
            nomB,
            'fr',
            {
              sensitivity: 'base'
            }
          );

        if (comparaisonNom !== 0) {
          return comparaisonNom;
        }

        return firstName(a)
          .localeCompare(
            firstName(b),
            'fr',
            {
              sensitivity: 'base'
            }
          );
      }
    );

}


/* ============================================================
   ANIMATEURS
   ============================================================ */

function animateursForActivity(
  activity
) {

  const value =
    get(
      activity,
      'Animateur_s',
      'Animateurs',
      'Animateur'
    );


  const ids =
    listIds(value);


  if (!ids.length) {

    return normalize(value);

  }


  const map =
    byId(
      state.animateurs
    );


  const names =
    ids
      .map(
        id =>
          map.get(
            Number(id)
          )
      )

      .filter(Boolean)

      .map(
        person => {

          const display =
            normalize(
              get(
                person,
                'Nom2'
              )
            );


          if (display) {

            return display;

          }


          const prenom =
            normalize(
              get(
                person,
                'Prenom',
                'Prénom'
              )
            );


          const nom =
            normalize(
              get(
                person,
                'Nom'
              )
            );


          return (
            `${prenom} ${nom}`
          ).trim();

        }
      )

      .filter(Boolean);


  return names.join(', ');

}


/* ============================================================
   CRÉATION D'UN PARTICIPANT
   ============================================================ */

async function createParticipant(
  user
) {

  const person =
    document.createElement(
      'div'
    );


  person.className =
    'participant';


  const portrait =
    document.createElement(
      'div'
    );


  portrait.className =
    'participant-photo';


  const url =
    await attachmentUrl(
      get(
        user,
        'Portrait'
      )
    );


  if (url) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      url;


    image.alt =
      userName(user);


    image.onerror =
      () => {

        portrait.innerHTML =
          '';

        portrait.textContent =
          initials(
            userName(user)
          );

      };


    portrait.appendChild(
      image
    );

  }

  else {

    portrait.textContent =
      initials(
        userName(user)
      );

  }


  const name =
    document.createElement(
      'div'
    );


  name.className =
    'participant-name';


  name.textContent =
    firstName(user);


  person.appendChild(
    portrait
  );


  person.appendChild(
    name
  );


  return person;

}


/* ============================================================
   CARTE ACTIVITÉ
   ============================================================ */

async function createActivityCard(
  activity
) {

  const card =
    document.createElement(
      'article'
    );


  card.className =
    'activity-card';


  /* ========================================================
     HAUT
     ======================================================== */

  const top =
    document.createElement(
      'div'
    );


  top.className =
    'activity-top';


  /* ========================================================
     TEXTE
     ======================================================== */

  const info =
    document.createElement(
      'div'
    );


  info.className =
    'activity-info';


  const title =
    document.createElement(
      'div'
    );


  title.className =
    'activity-title';


  title.textContent =
    normalize(
      get(
        activity,
        'Nom_activite'
      )
    )
    ||
    'Activité';


  const time =
    document.createElement(
      'div'
    );


  time.className =
    'activity-time';


  const start =
    activityHour(
      activity,
      true
    );


  const end =
    activityHour(
      activity,
      false
    );


  if (
    start &&
    end
  ) {

    time.textContent =
      `${start} – ${end}`;

  }

  else {

    time.textContent =
      start || end || '';

  }


  info.appendChild(
    title
  );


  if (
    time.textContent
  ) {

    info.appendChild(
      time
    );

  }


  /* ========================================================
     REMARQUES PLANNING
     Affichage du contenu uniquement, si renseigné.
     ======================================================== */

  const planningRemark =
    normalize(
      get(
        activity,
        'Remarques_planning',
        'Remarques planning',
        'remarques planning',
        'remarques_planning'
      )
    );


  if (planningRemark) {

    const remarkElement =
      document.createElement(
        'div'
      );


    /* Même style typographique que les noms des professionnels. */
    remarkElement.className =
      'activity-staff activity-planning-remark';


    remarkElement.textContent =
      planningRemark;


    info.appendChild(
      remarkElement
    );

  }


  /* ========================================================
     PICTOGRAMME
     ======================================================== */

  const pictogram =
    document.createElement(
      'div'
    );


  pictogram.className =
    'activity-pictogram';


  const visualUrl =
    await attachmentUrl(
      get(
        activity,
        'Visuel'
      )
    );


  if (visualUrl) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      visualUrl;


    image.alt =
      title.textContent;


    pictogram.appendChild(
      image
    );

  }


  top.appendChild(
    info
  );


  top.appendChild(
    pictogram
  );


  card.appendChild(
    top
  );


  /* ========================================================
     ANIMATEURS
     ======================================================== */

  const staff =
    animateursForActivity(
      activity
    );


  if (staff) {

    const staffElement =
      document.createElement(
        'div'
      );


    staffElement.className =
      'activity-staff';


    const strong =
      document.createElement(
        'strong'
      );


    strong.textContent =
      'Avec : ';


    staffElement.appendChild(
      strong
    );


    staffElement.appendChild(
      document.createTextNode(
        staff
      )
    );


    card.appendChild(
      staffElement
    );

  }


  /* ========================================================
     PARTICIPANTS
     ======================================================== */

  const participants =
    participantsForActivity(
      activity.id
    );


  if (
    participants.length
  ) {

    const participantTitle =
      document.createElement(
        'div'
      );


    participantTitle.className =
      'participant-title';


    participantTitle.textContent =
      participants.length === 1
        ? 'Participant'
        : 'Participants';


    card.appendChild(
      participantTitle
    );


    const grid =
      document.createElement(
        'div'
      );


    grid.className =
      'participant-grid';


    for (
      const participant
      of participants
    ) {

      grid.appendChild(
        await createParticipant(
          participant
        )
      );

    }


    card.appendChild(
      grid
    );

  }


  return card;

}


/* ============================================================
   ACTIVITÉS D'UN JOUR
   ============================================================ */

function activitiesForDay(
  day
) {

  return state.activities

    .filter(
      activity =>

        normalize(
          activityDay(activity)
        ).toLowerCase()

        ===

        day.name.toLowerCase()

    )

    .sort(
      (
        a,
        b
      ) =>

        minutes(
          activityHour(
            a,
            true
          )
        )

        -

        minutes(
          activityHour(
            b,
            true
          )
        )
    );

}


/* ============================================================
   CELLULE MATIN / APRÈS-MIDI
   ============================================================ */

async function createPeriodCell(
  day,
  activities,
  label
) {

  const cell =
    document.createElement(
      'section'
    );


  cell.className =
    `period-cell bg-${day.key}`;


  const periodLabel =
    document.createElement(
      'div'
    );


  periodLabel.className =
    'period-label';


  periodLabel.textContent =
    label;


  cell.appendChild(
    periodLabel
  );


  const list =
    document.createElement(
      'div'
    );


  list.className =
    'activity-list';


  if (
    !activities.length
  ) {

    const empty =
      document.createElement(
        'div'
      );


    empty.className =
      'empty-period';


    empty.textContent =
      'Aucune activité renseignée';


    list.appendChild(
      empty
    );

  }

  else {

    for (
      const activity
      of activities
    ) {

      list.appendChild(
        await createActivityCard(
          activity
        )
      );

    }

  }


  cell.appendChild(
    list
  );


  return cell;

}


/* ============================================================
   IMPRESSION PAGINÉE
   ============================================================ */

function buildPrintPages() {

  const sheet = document.getElementById('sheet');
  const planning = document.getElementById('planning');

  if (!sheet || !planning) {
    return;
  }

  const oldPrintPages = document.getElementById('print-pages');

  if (oldPrintPages) {
    oldPrintPages.remove();
  }

  const headers = Array.from(
    planning.querySelectorAll('.day-header')
  ).slice(0, 5);

  const periodCells = Array.from(
    planning.querySelectorAll('.period-cell')
  );

  if (headers.length !== 5 || periodCells.length < 10) {
    return;
  }

  const morningCells = periodCells.slice(0, 5);
  const afternoonCells = periodCells.slice(5, 10);

  const pagesRoot = document.createElement('div');
  pagesRoot.id = 'print-pages';
  pagesRoot.className = 'print-pages';

  const cloneCards = cells =>
    cells.map(cell =>
      Array.from(cell.querySelectorAll('.activity-card'))
    );

  const morningCards = cloneCards(morningCells);
  const afternoonCards = cloneCards(afternoonCells);

  const headerNames = headers.map(header => ({
    className: header.className,
    html: header.innerHTML
  }));

  /*
   * Pagination impression : on ne mesure PAS la hauteur écran.
   * À l'écran les portraits font 60 px, alors qu'à l'impression ils
   * sont volontairement plus petits. Une mesure écran ferait donc
   * croire qu'une carte est plus haute qu'elle ne le sera réellement
   * dans Firefox et provoquerait des sauts de page prématurés.
   *
   * Les capacités ci-dessous correspondent à la hauteur utile réelle
   * d'une page A3 paysage avec les règles @media print de style.css.
   */
  const FIRST_PAGE_CAPACITY = 965;
  const OTHER_PAGE_CAPACITY = 1020;
  const CARD_GAP = 3;
  const MEAL_HEIGHT = 19;

  function measuredHeight(card) {
    const participants = card.querySelectorAll('.participant').length;
    const participantRows = Math.ceil(participants / 5);

    const hasStaff = Boolean(
      card.querySelector('.activity-staff:not(.activity-planning-remark)')
    );
    const remark = card.querySelector('.activity-planning-remark');
    const remarkLength = remark ? remark.textContent.trim().length : 0;
    const title = card.querySelector('.activity-title');
    const titleLength = title ? title.textContent.trim().length : 0;

    /* Hauteur du bloc supérieur : pictogramme 34 px minimum.
       On ajoute une petite marge pour les titres longs qui passent
       sur deux ou trois lignes dans une colonne de jour. */
    let topHeight = 34;
    if (titleLength > 28) topHeight += 8;
    if (titleLength > 55) topHeight += 8;

    /* padding carte + haut + éventuel animateur */
    let height = 8 + topHeight;

    if (remarkLength > 0) {
      /* Même corps que les professionnels. La remarque peut revenir
         sur plusieurs lignes dans une colonne de jour. */
      height += 9;
      if (remarkLength > 38) height += 7;
      if (remarkLength > 78) height += 7;
    }

    if (hasStaff) {
      height += 9;
    }

    if (participants > 0) {
      /* titre Participants + grille : portrait 38 px, prénom et espacements */
      height += 10;
      height += participantRows * 47;
      if (participantRows > 1) {
        height += (participantRows - 1) * 2;
      }
    }

    /* petite sécurité pour bordures / arrondis / métriques Firefox */
    return Math.ceil(height + 3);
  }

  function createPage(showMainTitle, phaseLabel, showMeal) {
    const page = document.createElement('section');
    page.className = 'print-page';

    if (showMainTitle) {
      const mainHeader = document.createElement('header');
      mainHeader.className = 'print-main-header';
      mainHeader.innerHTML = `
        <div class="planning-kicker">SAJ Anagallis</div>
        <h1>Planning collectif</h1>
      `;
      page.appendChild(mainHeader);
    }

    if (showMeal) {
      const meal = document.createElement('div');
      meal.className = 'print-meal-row';
      meal.textContent = '12 h • Repas';
      page.appendChild(meal);
    }

    const grid = document.createElement('div');
    grid.className = 'print-page-grid';

    const lists = [];

    headerNames.forEach((headerData, index) => {
      const column = document.createElement('section');
      column.className = 'print-day-column';

      const header = document.createElement('div');
      header.className = headerData.className;
      header.innerHTML = headerData.html;
      column.appendChild(header);

      const period = document.createElement('div');
      period.className = `print-period bg-${DAYS[index].key}`;

      const label = document.createElement('div');
      label.className = 'period-label';
      label.textContent = phaseLabel;
      period.appendChild(label);

      const list = document.createElement('div');
      list.className = 'activity-list';
      period.appendChild(list);

      column.appendChild(period);
      grid.appendChild(column);
      lists.push(list);
    });

    page.appendChild(grid);
    pagesRoot.appendChild(page);

    return { lists };
  }

  function appendPhase(cardColumns, phaseLabel, firstPhasePageHasMainTitle, showMealOnFirstPage) {
    const positions = [0, 0, 0, 0, 0];
    let firstPhasePage = true;

    const hasRemaining = () =>
      cardColumns.some((cards, i) => positions[i] < cards.length);

    if (!hasRemaining()) {
      return false;
    }

    while (hasRemaining()) {
      const showTitle = firstPhasePage && firstPhasePageHasMainTitle;
      const showMeal = firstPhasePage && showMealOnFirstPage;

      let capacity = showTitle
        ? FIRST_PAGE_CAPACITY
        : OTHER_PAGE_CAPACITY;

      if (showMeal) {
        capacity -= MEAL_HEIGHT;
      }

      const { lists } = createPage(
        showTitle,
        phaseLabel,
        showMeal
      );

      for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
        const cards = cardColumns[dayIndex];
        let used = 0;
        let added = 0;

        while (positions[dayIndex] < cards.length) {
          const sourceCard = cards[positions[dayIndex]];
          const cardHeight = measuredHeight(sourceCard);
          const nextHeight = used + (added ? CARD_GAP : 0) + cardHeight;

          if (added > 0 && nextHeight > capacity) {
            break;
          }

          const clone = sourceCard.cloneNode(true);
          lists[dayIndex].appendChild(clone);

          used = nextHeight;
          added += 1;
          positions[dayIndex] += 1;

          if (used >= capacity) {
            break;
          }
        }
      }

      firstPhasePage = false;
    }

    return true;
  }

  const hasMorning = appendPhase(morningCards, 'MATIN', true, false);

  if (!hasMorning) {
    appendPhase(afternoonCards, 'APRÈS-MIDI', true, true);
  }
  else {
    appendPhase(afternoonCards, 'APRÈS-MIDI', false, true);
  }

  /* Si aucune activité n'existe du tout, on conserve malgré tout
     une première page avec les titres et les cinq jours. */
  if (!pagesRoot.children.length) {
    createPage(true, 'MATIN', false);
  }

  sheet.appendChild(pagesRoot);
}


/* ============================================================
   RENDU
   ============================================================ */

async function render() {

  const planning =
    document.getElementById(
      'planning'
    );


  planning.innerHTML =
    '';


  /* ========================================================
     ACTIVITÉS PAR JOUR
     ======================================================== */

  const dayData =
    DAYS.map(
      day => {

        const activities =
          activitiesForDay(
            day
          );


        const morning =
          activities.filter(
            activity =>
              minutes(
                activityHour(
                  activity,
                  true
                )
              )
              <
              720
          );


        const afternoon =
          activities.filter(
            activity =>
              minutes(
                activityHour(
                  activity,
                  true
                )
              )
              >=
              720
          );


        return {

          day,
          activities,
          morning,
          afternoon

        };

      }
    );


  /* ========================================================
     GRILLE
     ======================================================== */

  const grid =
    document.createElement(
      'div'
    );


  grid.className =
    'planning-grid';


  /* ========================================================
     1 — EN-TÊTES DES JOURS
     ======================================================== */

  dayData.forEach(
    data => {

      const header =
        document.createElement(
          'div'
        );


      header.className =
        `day-header day-${data.day.key}`;


      const name =
        document.createElement(
          'span'
        );


      name.textContent =
        data.day.name;


      const count =
        document.createElement(
          'span'
        );


      count.className =
        'day-header-count';


      count.textContent =

        `${data.activities.length} ${
          data.activities.length > 1
            ? 'activités'
            : 'activité'
        }`;


      header.appendChild(
        name
      );


      header.appendChild(
        count
      );


      grid.appendChild(
        header
      );

    }
  );


  /* ========================================================
     2 — MATIN
     ======================================================== */

  for (
    const data
    of dayData
  ) {

    grid.appendChild(
      await createPeriodCell(
        data.day,
        data.morning,
        'MATIN'
      )
    );

  }


  /* ========================================================
     3 — BANDEAU REPAS
     ======================================================== */

  const meal =
    document.createElement(
      'div'
    );


  meal.className =
    'meal-row';


  meal.textContent =
    '12 h • Repas';


  grid.appendChild(
    meal
  );


  /* ========================================================
     4 — APRÈS-MIDI
     ======================================================== */

  for (
    const data
    of dayData
  ) {

    grid.appendChild(
      await createPeriodCell(
        data.day,
        data.afternoon,
        'APRÈS-MIDI'
      )
    );

  }


  planning.appendChild(
    grid
  );


  buildPrintPages();


  /* ========================================================
     AFFICHAGE
     ======================================================== */

  document
    .getElementById(
      'status'
    )
    .classList.add(
      'hidden'
    );


  document
    .getElementById(
      'sheet'
    )
    .classList.remove(
      'hidden'
    );

}


/* ============================================================
   CHARGEMENT GRIST
   ============================================================ */

async function load() {

  try {

    attachmentTokenInfo =
      null;


    attachmentCache.clear();


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

            try {

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

            catch (error) {

              console.warn(
                `Table ${tableName} inaccessible`,
                error
              );


              return [
                key,
                []
              ];

            }

          }

        )

      );


    state =
      Object.fromEntries(
        entries
      );


    if (
      !state.activities.length
    ) {

      throw new Error(
        'La table Activites est vide ou inaccessible.'
      );

    }


    await render();

  }

  catch (error) {

    console.error(
      error
    );


    document
      .getElementById(
        'sheet'
      )
      .classList.add(
        'hidden'
      );


    const status =
      document.getElementById(
        'status'
      );


    status.textContent =
      'Impossible de charger le planning collectif.';


    status.classList.remove(
      'hidden'
    );

  }

}


/* ============================================================
   BOUTON IMPRESSION
   ============================================================ */

document
  .getElementById(
    'printButton'
  )
  .addEventListener(

    'click',

    () => {

      buildPrintPages();
      window.print();

    }

  );


window.addEventListener(
  'beforeprint',
  buildPrintPages
);


/* ============================================================
   INITIALISATION GRIST
   ============================================================ */

grist.ready({

  requiredAccess:
    'read table'

});


/* ============================================================
   DÉMARRAGE
   ============================================================ */

load();