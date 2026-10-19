const LEVEL_DATA = {};

const PATROL_LEVELS = ['Swim For Life 9', 'Swim For Life 10', 'Swim For Life 11'];

function getVoice(level) {
  if (level.includes('Youth') || level.includes('Adult') || PATROL_LEVELS.includes(level)) return 'you';
  if (level.includes('Parent')) return 'parenttot';
  return 'name';
}

function findSkill(level, label) {
  const data = LEVEL_DATA[level];
  return data ? data.skills.find(s => s.label === label) : undefined;
}

// Possessive wording: "their" unless the student's gender is given ('female' -> her, 'male' -> his).
function possessive(gender) {
  return gender === 'female' ? 'her' : gender === 'male' ? 'his' : 'their';
}

function fillTokens(template, voice, name, gender) {
  const you = voice === 'you';
  return template
    .replace(/\{S\}/g, you ? 'you' : name)
    .replace(/\{their\}/g, you ? 'your' : possessive(gender))
    .replace(/\{is\}/g, you ? 'are' : 'is')
    .replace(/\{has\}/g, you ? 'have' : 'has')
    .replace(/\{name\}/g, name);
}

function capitalizeFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "liam chen" -> "Liam Chen"; leaves the rest of each word as typed so "McDonald" stays intact.
function formatName(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

function cleanNote(text) {
  let note = (text || '').trim().replace(/\s+/g, ' ');
  if (!note) return '';
  note = capitalizeFirst(note);
  if (!/[.!?]$/.test(note)) note += '.';
  return note;
}

function lowercaseFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// A sentence can follow a linking phrase ("In addition, ...") only if it opens with the subject.
function canTakeLead(template, voice) {
  return template.startsWith('{S}') || (voice === 'you' && /^Your?\b/.test(template));
}

const LEAD_PROBABILITY = 0.7;

// Wording that makes a linking phrase repeat itself, e.g. "To keep improving, Sam will keep improving by...".
// A phrase is skipped for any sentence that already contains one of its words.
const LEAD_ECHOES = {
  'To keep improving,': ['improv'],
  'As a next step,': ['next step'],
  'Looking ahead,': ['ahead', 'looking'],
  'To build on this,': ['build'],
  'Going forward,': ['forward', 'going'],
  'In addition,': ['in addition', 'also'],
  'On top of that,': ['on top of that'],
  'As well,': ['as well'],
  'Also,': ['also']
};

function echoesLead(lead, template) {
  const text = template.toLowerCase();
  return (LEAD_ECHOES[lead] || []).some(word => text.includes(word));
}

function pickVariant(pool, avoid) {
  const fresh = pool.filter(p => !avoid.has(p));
  const source = fresh.length ? fresh : pool;
  return source[Math.floor(Math.random() * source.length)];
}

// Sandwich order: intro, praise (s1), critique (w1), praise (s2), closing.
// `avoid` is a Set of previously used templates so regenerating / batching varies the wording.
function buildComment({ level, name: rawName, gender, s1, s2, w1, notes = {}, avoid = new Set() }) {
  const name = formatName(rawName).split(' ')[0];
  const voice = getVoice(level);
  const phrases = PHRASES[voice];
  const praiseSkill1 = findSkill(level, s1);
  const praiseSkill2 = findSkill(level, s2);
  const critiqueSkill = findSkill(level, w1);
  if (!praiseSkill1 || !praiseSkill2 || !critiqueSkill) return null;

  const picks = [];
  const take = pool => {
    const template = pickVariant(pool, avoid);
    picks.push(template);
    return template;
  };
  const render = (template, note, leadPool) => {
    let sentence = capitalizeFirst(fillTokens(template, voice, name, gender));
    const leads = leadPool ? leadPool.filter(lead => !echoesLead(lead, template)) : [];
    if (leads.length && canTakeLead(template, voice) && Math.random() < LEAD_PROBABILITY) {
      const lead = take(leads);
      sentence = `${lead} ${voice === 'you' ? lowercaseFirst(sentence) : sentence}`;
    }
    const extra = cleanNote(note);
    return extra ? `${sentence} ${extra}` : sentence;
  };

  const intro = render(take(phrases.intros));
  const praise1 = render(take(praiseSkill1.praise), notes.s1);
  const critique = render(take(critiqueSkill.critique), notes.w1, LEADS.critique);
  const praise2 = render(take(praiseSkill2.praise), notes.s2, LEADS.praise);
  const closing = render(take(phrases.closings));

  return { text: [intro, praise1, critique, praise2, closing].join(' '), picks };
}
