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
   * qui peuvent s'afficher en demi-largeur.
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
    aParticipantCount <= 3;


  const bHalfWidth =
    bParticipantCount <= 3;


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
   CARTE ACTIVITÉ
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

    .join(
      ' – '
    );


  const participantIds =
    [...activity.participants];


  /*
   * Tri alphabétique des personnes.
   */

  participantIds.sort(

    (
      firstId,
      secondId
    ) => {

      const first =
        state.usersById
          .get(
            Number(firstId)
          );


      const second =
        state.usersById
          .get(
            Number(secondId)
          );


      const firstLastName =
        text(
          first?.Nom
        );


      const secondLastName =
        text(
          second?.Nom
        );


      const lastNameComparison =
        firstLastName
          .localeCompare(

            secondLastName,

            'fr',

            {
              sensitivity: 'base'
            }

          );


      if (
        lastNameComparison !== 0
      ) {

        return lastNameComparison;

      }


      return userFirstName(first)
        .localeCompare(

          userFirstName(second),

          'fr',

          {
            sensitivity: 'base'
          }

        );

    }

  );


  /* ========================================================
     LARGEUR DE LA TUILE
     Une activité de 1 à 3 participants peut occuper une demi-largeur.
     Deux activités compactes consécutives peuvent donc partager une ligne.
     ======================================================== */

  const useHalfWidth =
    participantIds.length <= 3;


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


  /* ========================================================
     REMARQUES PLANNING
     ======================================================== */

  const remarksHtml =

    activity.remarks

      ?

      `

      <div class="activity-remarks">
        ${esc(activity.remarks)}
      </div>

      `

      :

      '';


  /* ========================================================
     ANIMATEURS
     ======================================================== */

  const animatorHtml =

    activity.animators.length

      ?

      `

      <div class="activity-meta">

        <strong>
          Avec :
        </strong>

        ${esc(
          activity.animators
            .join(', ')
        )}

      </div>

      `

      :

      '';


  /* ========================================================
     PICTOGRAMME
     ======================================================== */

  const pictogramHtml =

    pictogramUrl

      ?

      `

      <img
        class="activity-logo"
        src="${pictogramUrl}"
        alt=""
      >

      `

      :

      '';


  /* ========================================================
     PARTICIPANTS
     ======================================================== */

  const peopleHtml =

    participantIds.length

      ?

      `

      <div class="participants-title">

        Participant${
          participantIds.length > 1
            ? 's'
            : ''
        }
        ·
        ${participantIds.length}

      </div>


      <div class="participants-grid">

        ${participantsHtml}

      </div>

      `

      :

      `

      <div class="participants-title">

        Participants

      </div>


      <div class="empty-slot">

        Aucun participant renseigné

      </div>

      `;


  /* ========================================================
     HTML FINAL
     ======================================================== */

  return `

    <article

      class="activity-card${
        useHalfWidth
          ? ' activity-card--half'
          : ''
      }"

      style="
        --card-color:
          ${cardColor};
      "

    >


      <div class="activity-header">


        <h3 class="activity-title">

          ${esc(
            activity.name
          )}

        </h3>


        ${
          schedule

            ?

            `

            <div class="activity-time">

              ${esc(schedule)}

            </div>

            `

            :

            ''
        }


        ${animatorHtml}


        ${remarksHtml}


      </div>


      ${pictogramHtml}


      ${peopleHtml}


    </article>

  `;

}


/* ============================================================
   PÉRIODE
   ============================================================ */

async function periodHtml(
  title,
  activities,
  cssClass,
  dayName
) {

  let content;


  if (
    activities.length
  ) {

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

      <div class="empty-slot">

        Aucune activité renseignée

      </div>

    `;

  }


  return `

    <section
      class="
        period
        ${cssClass}
      "
      data-day="${esc(dayName)}"
    >


      <div class="period-title">

        ${esc(title)}

      </div>


      <div class="activities-list">

        ${content}

      </div>


    </section>

  `;

}


/* ============================================================
   PAGE D'UNE JOURNÉE
   ============================================================ */

async function dayPage(
  day
) {

  const activities =

    state.activities

      .filter(

        activity =>
          activity.day
          ===
          day.name

      )

      .sort(
        sortActivities
      );


  const morning =

    activities.filter(

      activity =>
        periodOf(activity)
        ===
        'Matin'

    );


  const afternoon =

    activities.filter(

      activity =>
        periodOf(activity)
        ===
        'ApresMidi'

    );


  const morningHtml =
    await periodHtml(

      'MATIN',

      morning,

      'period-morning',

      day.name

    );


  const afternoonHtml =
    await periodHtml(

      'APRÈS-MIDI',

      afternoon,

      'period-afternoon',

      day.name

    );


  return `

    <article

      class="day-page"

      style="
        --day-color:
          ${day.color};

        --day-background:
          ${day.background};
      "

    >


      <header class="day-title">

        ${esc(
          day.name
        )}

      </header>



      <div class="day-body">


        ${morningHtml}


        <div class="meal-banner">

          12 h · Repas

        </div>


        ${afternoonHtml}


      </div>



      <footer class="page-footer">

        Odynéo · Les Tourrais de Craponne ·
        Service d'accueil de jour Anagallis

      </footer>


    </article>

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
    .add(
      'hidden'
    );


  pages
    .classList
    .remove(
      'hidden'
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
   AJUSTEMENT RÉEL POUR TENIR SUR UNE PAGE A3
   ============================================================ */

/*
 * Aucun transform/zoom n'est utilisé ici.
 * On réduit réellement les dimensions CSS via --print-fit-factor.
 * Cela évite le défaut de pagination observé dans Firefox
 * sur les pages suivant la première.
 */
function resetPrintFit() {

  document
    .querySelectorAll(
      '.period'
    )
    .forEach(

      period => {

        period.style.removeProperty(
          '--print-fit-factor'
        );

      }

    );

}


function fitPeriodsToA3() {

  const periods =
    Array.from(
      document.querySelectorAll(
        '.period'
      )
    );


  periods.forEach(

    period => {

      period.style.setProperty(
        '--print-fit-factor',
        '1'
      );


      /*
       * Force le recalcul après remise à la taille normale.
       */
      void period.offsetHeight;


      const fitsAt = factor => {

        period.style.setProperty(
          '--print-fit-factor',
          String(factor)
        );


        void period.offsetHeight;


        /*
         * scrollHeight reste supérieur à clientHeight si le contenu
         * dépasse réellement de la page, même avec overflow:hidden.
         */
        return period.scrollHeight
          <=
          period.clientHeight
          +
          2;

      };


      if (
        fitsAt(1)
      ) {

        return;

      }


      /*
       * Recherche du plus grand facteur qui tient réellement.
       * On descend seulement autant que nécessaire.
       */
      let low =
        0.42;

      let high =
        1;


      if (
        !fitsAt(low)
      ) {

        /*
         * Cas exceptionnel de demi-journée extrêmement chargée.
         * La priorité reste : une seule page A3.
         */
        let emergency =
          low;


        while (
          emergency > 0.18
          &&
          !fitsAt(emergency)
        ) {

          emergency -=
            0.03;

        }


        period.style.setProperty(
          '--print-fit-factor',
          String(
            Math.max(
              0.18,
              emergency
            )
          )
        );


        return;

      }


      for (
        let i = 0;
        i < 16;
        i += 1
      ) {

        const mid =
          (
            low
            +
            high
          )
          /
          2;


        if (
          fitsAt(mid)
        ) {

          low =
            mid;

        }


        else {

          high =
            mid;

        }

      }


      /*
       * Petite marge de sécurité pour l'impression réelle.
       */
      period.style.setProperty(
        '--print-fit-factor',
        String(
          low
          *
          0.985
        )
      );

    }

  );

}


window.addEventListener(

  'beforeprint',

  () => {

    resetPrintFit();

    fitPeriodsToA3();

  }

);


window.addEventListener(
  'afterprint',
  resetPrintFit
);


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