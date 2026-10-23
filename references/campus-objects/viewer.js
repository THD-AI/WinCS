'use strict';
const $ = id => document.getElementById(id);
let boards = [], current = 0, reading = 0;
let recordings = [];
const transcriptRoot = '../../docs/brief/transcripts/';
function choose(index) {
  current = (index + boards.length) % boards.length;
  const board = boards[current];
  $('board').value = board.id;
  $('board-image').src = board.file;
  $('board-image').alt = `${board.title} · AI-cleaned photographic reference`;
  $('full-image').href = board.file;
  $('board-title').textContent = board.title;
  $('hook').textContent = board.hook;
  $('observed').textContent = board.observation;
  $('use').textContent = board.proposal;
  $('limits').textContent = board.limitations;
  $('coverage').textContent = `${board.source_ids.length} reviewed source angles: ${board.source_ids.join(', ')}. Selected views, not every original repeated.`;
  $('board-page').href = board.page;
  $('position').textContent = `${current + 1} / ${boards.length}`;
  for (const button of $('thumbnails').children) button.setAttribute('aria-current', String(button.dataset.id === board.id));
  history.replaceState(null, '', `#${board.id}`);
}
function inlineText(line) { return line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'); }
async function readTranscript(record) {
  const ticket = ++reading;
  const reader = $('reader'); reader.hidden = false; reader.textContent = 'Loading transcript…';
  reader.scrollIntoView({block: 'start'});
  try {
    const response = await fetch(transcriptRoot + record.file);
    if (!response.ok) throw new Error(`Transcript HTTP ${response.status}`);
    const text = await response.text();
    if (ticket !== reading) return;
    reader.replaceChildren();
    const controls = document.createElement('div'); controls.className = 'controls';
    const index = recordings.indexOf(record);
    for (const [label, delta] of [['← Previous recording', -1], ['Next recording →', 1]]) {
      const button = document.createElement('button'); button.textContent = label;
      button.disabled = index + delta < 0 || index + delta >= recordings.length;
      button.addEventListener('click', () => readTranscript(recordings[index + delta])); controls.append(button);
    }
    const back = document.createElement('button'); back.textContent = 'Back to collages';
    back.addEventListener('click', () => $('previous').scrollIntoView({block: 'start'})); controls.append(back);
    reader.append(controls);
    const source = document.createElement('a'); source.href = transcriptRoot + record.file; source.textContent = 'Open the source transcript in Markdown'; reader.append(source);
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      if (!block.trim() || block.includes('Transcript library]')) continue;
      const anchor = block.match(/^<a id="(p\d+)"><\/a>$/);
      if (anchor) { const marker = document.createElement('p'); marker.className = 'paragraph-id'; marker.textContent = anchor[1]; reader.append(marker); continue; }
      const heading = block.match(/^(#{1,3}) (.+)$/);
      const element = document.createElement(heading ? `h${heading[1].length}` : 'p');
      element.textContent = inlineText(heading ? heading[2] : block);
      reader.append(element);
    }
  } catch (error) { if (ticket === reading) reader.textContent = `Could not load transcript: ${error.message}. Use the Markdown library link.`; }
}
async function start() {
  try {
    const responses = await Promise.all([fetch('media-sources.json'), fetch(transcriptRoot + 'source-index.json')]);
    if (responses.some(response => !response.ok)) throw new Error('A reference manifest could not be loaded');
    const [media, transcripts] = await Promise.all(responses.map(response => response.json()));
    boards = media.outputs;
    for (const board of boards) {
      const option = document.createElement('option'); option.value = board.id; option.textContent = board.title; $('board').append(option);
      const button = document.createElement('button'); button.dataset.id = board.id;
      const img = document.createElement('img'); img.src = board.file; img.alt = ''; img.loading = 'lazy';
      button.append(img, document.createTextNode(board.title)); button.addEventListener('click', () => choose(boards.indexOf(board))); $('thumbnails').append(button);
    }
    recordings = transcripts.recordings;
    for (const record of [...recordings.slice(10), ...recordings.slice(0, 10)]) {
      const card = document.createElement('article'); card.className = 'card';
      const title = document.createElement('h3'); title.textContent = `${record.id} · ${record.title}`;
      const duration = document.createElement('p'); duration.className = 'muted'; duration.textContent = `${(record.duration_seconds / 60).toFixed(2)} min · OpenAI API`;
      const summary = document.createElement('p'); summary.textContent = record.summary;
      const button = document.createElement('button'); button.textContent = `Read ${record.id}`; button.addEventListener('click', () => readTranscript(record));
      card.append(title, duration, summary, button); $('recordings').append(card);
    }
    $('previous').addEventListener('click', () => choose(current - 1));
    $('next').addEventListener('click', () => choose(current + 1));
    $('board').addEventListener('change', () => choose(boards.findIndex(board => board.id === $('board').value)));
    for (const id of ['previous', 'next', 'board']) $(id).disabled = false;
    const initial = boards.findIndex(board => `#${board.id}` === location.hash);
    choose(initial < 0 ? 1 : initial);
    $('status').textContent = `${boards.length} collages / ${media.source_count} indexed photos / ${transcripts.recordings.length} complete API transcripts. Reference review, not a game build.`;
  } catch (error) { $('status').textContent = `Unable to load review: ${error.message}. Open this page through the local HTTP server, or use the Markdown library.`; }
}
start();
