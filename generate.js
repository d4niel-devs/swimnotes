// Connects the interface (script.js) to the comment engine: comments are assembled from the
// phrase bank in data/*.js (see compose.js).
const APP = { notes: 'parts', pdf: true };

function getSkillLabels(level) {
  return LEVEL_DATA[level] ? LEVEL_DATA[level].skills.map(skill => skill.label) : [];
}

function getLevelDescription(level) {
  return LEVEL_DATA[level] ? LEVEL_DATA[level].desc : '';
}

async function produceComment({ level, name, s1, s2, w1, notes, avoid }) {
  const result = buildComment({ level, name, s1, s2, w1, notes, avoid });
  if (!result) {
    throw { userMessage: 'Those skills are not part of this level. Pick the level again, then choose the skills.' };
  }
  return result;
}
