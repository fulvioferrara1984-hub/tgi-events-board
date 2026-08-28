/* ==========================================================================
   TGI Sport Europa — Tabellone Eventi
   Legge data/events.json (pubblicato da publish_events_board.py) e
   disegna un tabellone stile "Solari board" con animazione split-flap.
   ========================================================================== */

const DATA_URL = "data/events.json";
const DATA_REFRESH_MS = 5 * 60 * 1000;   // ricarica events.json ogni 5 minuti
const PAGE_INTERVAL_MS = 7000;           // avanzamento pagina (loop) ogni 7s
const ROWS_PER_PAGE = 8;
const LOGO_PATH = "assets/tgi_logo.png";

const STATUS_CLASS = {
  "CONFIRMED": "status-confirmed",
  "TBC": "status-tbc",
  "CARRIED OUT": "status-carried-out",
};

let state = { columns: { past: [], future: [] }, past_events: [], future_events: [] };
let pastPageIndex = 0;
let futurePageIndex = 0;
let pastPageTimer = null;
let futurePageTimer = null;

// ------------------------------------------------------------ split-flap

function makeFlapWord(text) {
  const word = document.createElement("span");
  word.className = "flap-word";
  word.dataset.value = "";
  updateFlapWord(word, text);
  return word;
}

function updateFlapWord(word, text) {
  const target = String(text ?? "");
  const prev = word.dataset.value || "";
  const len = Math.max(target.length, prev.length, word.children.length);

  // Adegua il numero di celle carattere alla lunghezza del testo.
  while (word.children.length < len) {
    const flap = document.createElement("span");
    flap.className = "flap";
    flap.innerHTML = '<span class="flap-face front"></span><span class="flap-face back"></span>';
    word.appendChild(flap);
  }
  while (word.children.length > len) {
    word.removeChild(word.lastChild);
  }

  for (let i = 0; i < len; i++) {
    const flap = word.children[i];
    const newChar = target[i] ?? " ";
    const oldChar = prev[i] ?? " ";
    const front = flap.querySelector(".front");
    const back = flap.querySelector(".back");
    if (newChar === oldChar && front.textContent !== "") continue;

    back.textContent = newChar;
    flap.classList.remove("flipping");
    // Forza il reflow cosi' l'animazione riparte anche se il flap stava
    // gia' animando (utile quando i dati cambiano molto ravvicinati).
    void flap.offsetWidth;
    flap.classList.add("flipping");
    const onEnd = () => {
      front.textContent = newChar;
      flap.classList.remove("flipping");
      flap.removeEventListener("animationend", onEnd);
    };
    flap.addEventListener("animationend", onEnd);
    // Fallback se l'evento non arriva (tab in background ecc.)
    setTimeout(() => {
      if (flap.classList.contains("flipping")) {
        front.textContent = newChar;
        flap.classList.remove("flipping");
      }
    }, 500);
  }
  word.dataset.value = target;
}

// ------------------------------------------------------------- rendering

const MAX_FIELD_CHARS = 10; // limite duro (una data "22/08/2026" e' 10 caratteri): evita che un valore lungo sfondi la riga

function padColumns(events, columns) {
  const widths = columns.map((col) => {
    let max = Math.min(col.length, MAX_FIELD_CHARS);
    for (const ev of events) {
      const v = String(ev.fields[col] ?? "");
      max = Math.max(max, Math.min(v.length, MAX_FIELD_CHARS));
    }
    return max;
  });
  return widths;
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return maxLen <= 1 ? text.slice(0, maxLen) : text.slice(0, maxLen - 1) + "…";
}

function renderColumnHeads(container, columns) {
  container.innerHTML = "";
  const spacer = document.createElement("span");
  spacer.className = "col-icon-spacer";
  container.appendChild(spacer);
  for (const col of columns) {
    const head = document.createElement("span");
    head.className = "board-col-head";
    head.textContent = col;
    container.appendChild(head);
  }
}

function iconFor(ev) {
  if (ev.icon) {
    const span = document.createElement("span");
    span.textContent = ev.icon;
    return span;
  }
  const img = document.createElement("img");
  img.src = LOGO_PATH;
  img.alt = "TGI Sport";
  return img;
}

function renderRows(container, events, columns, widths, existingRows) {
  const rows = existingRows || [];
  while (rows.length < events.length) {
    const row = document.createElement("div");
    row.className = "board-row";

    const iconWrap = document.createElement("div");
    iconWrap.className = "row-icon";
    row.appendChild(iconWrap);

    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "row-fields";
    const flapWords = columns.map((col, i) => {
      const fieldWrap = document.createElement("div");
      fieldWrap.className = "row-field";
      const word = makeFlapWord("");
      fieldWrap.appendChild(word);
      fieldsWrap.appendChild(fieldWrap);
      return word;
    });
    row.appendChild(fieldsWrap);
    container.appendChild(row);
    rows.push({ el: row, iconWrap, flapWords });
  }
  while (rows.length > events.length) {
    const r = rows.pop();
    r.el.remove();
  }

  events.forEach((ev, i) => {
    const r = rows[i];
    r.el.className = "board-row " + (STATUS_CLASS[ev.status] || "");
    r.iconWrap.innerHTML = "";
    r.iconWrap.appendChild(iconFor(ev));
    columns.forEach((col, ci) => {
      const full = String(ev.fields[col] ?? "");
      const raw = truncate(full, widths[ci]);
      const padded = raw.padEnd(widths[ci], " ");
      updateFlapWord(r.flapWords[ci], padded);
      const fieldWrap = r.flapWords[ci].parentElement;
      if (full.length > widths[ci]) {
        fieldWrap.title = full;
      } else {
        fieldWrap.removeAttribute("title");
      }
    });
  });

  return rows;
}

const sectionRowCache = { past: [], future: [] };

function renderSection(kind, allEvents, columns, pageIndex) {
  const rowsEl = document.getElementById(kind + "Rows");
  const colsEl = document.getElementById(kind + "Columns");
  const pageEl = document.getElementById(kind + "Page");

  if (!allEvents.length) {
    rowsEl.innerHTML = '<div class="empty-state">Nessun evento da mostrare</div>';
    colsEl.innerHTML = "";
    pageEl.textContent = "";
    sectionRowCache[kind] = [];
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allEvents.length / ROWS_PER_PAGE));
  const safePage = ((pageIndex % totalPages) + totalPages) % totalPages;
  const start = safePage * ROWS_PER_PAGE;
  const pageEvents = allEvents.slice(start, start + ROWS_PER_PAGE);

  renderColumnHeads(colsEl, columns);
  const widths = padColumns(allEvents, columns);
  sectionRowCache[kind] = renderRows(rowsEl, pageEvents, columns, widths, sectionRowCache[kind]);

  pageEl.textContent = totalPages > 1 ? `Pagina ${safePage + 1}/${totalPages}` : "";
}

function renderAll() {
  renderSection("past", state.past_events, state.columns.past, pastPageIndex);
  renderSection("future", state.future_events, state.columns.future, futurePageIndex);
}

function schedulePaging() {
  clearInterval(pastPageTimer);
  clearInterval(futurePageTimer);
  const pastPages = Math.ceil(state.past_events.length / ROWS_PER_PAGE);
  const futurePages = Math.ceil(state.future_events.length / ROWS_PER_PAGE);
  if (pastPages > 1) {
    pastPageTimer = setInterval(() => {
      pastPageIndex++;
      renderSection("past", state.past_events, state.columns.past, pastPageIndex);
    }, PAGE_INTERVAL_MS);
  }
  if (futurePages > 1) {
    futurePageTimer = setInterval(() => {
      futurePageIndex++;
      renderSection("future", state.future_events, state.columns.future, futurePageIndex);
    }, PAGE_INTERVAL_MS + 400); // sfasato leggermente rispetto al passato, effetto meno "sincrono"
  }
}

// ------------------------------------------------------------------ clock

function tickClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("it-IT", { hour12: false });
  document.getElementById("clockDate").textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  document.getElementById("clockTime").textContent = timeStr;
}

// ------------------------------------------------------------------- data

async function loadData() {
  try {
    const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    state = json;
    pastPageIndex = 0;
    futurePageIndex = 0;
    renderAll();
    schedulePaging();
    const gen = json.generated_at ? new Date(json.generated_at).toLocaleString("it-IT") : "—";
    document.getElementById("footerStatus").textContent = `Ultimo aggiornamento dati: ${gen}`;
  } catch (err) {
    document.getElementById("footerStatus").textContent =
      "Impossibile caricare i dati (" + err.message + ") — nuovo tentativo a breve.";
  }
}

// ------------------------------------------------------------------- init

tickClock();
setInterval(tickClock, 1000);
loadData();
setInterval(loadData, DATA_REFRESH_MS);
