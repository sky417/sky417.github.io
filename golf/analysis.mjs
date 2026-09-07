export const sum = (values) => values.reduce((total, value) => total + value, 0);
export const mean = (values) => values.length ? sum(values) / values.length : null;
export const percent = (part, whole) => whole ? part / whole * 100 : null;
export const roundTo = (value, digits = 1) => value === null ? null : Number(value.toFixed(digits));
export const roundIdentity = (round) => `${round.date}|${round.course}|${round.tee}`;

function requireNumber(value, label, { min = 0, integer = false, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
}

function requireGrid(values, label, options) {
  if (!Array.isArray(values) || values.length !== 18) throw new Error(`${label} must contain exactly 18 holes.`);
  values.forEach((value, index) => requireNumber(value, `${label}, hole ${index + 1}`, options));
}

export function validateRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) throw new Error('No rounds were provided.');
  const identities = new Set();
  for (const round of rounds) {
    const label = `${round.date} / ${round.course}`;
    const timestamp = Date.parse(`${round.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(round.date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== round.date) {
      throw new Error(`Invalid round date: ${round.date}`);
    }
    if (typeof round.course !== 'string' || !round.course || typeof round.tee !== 'string') {
      throw new Error(`${label}: course and tee are required.`);
    }
    if (identities.has(roundIdentity(round))) throw new Error(`Duplicate round: ${label} / ${round.tee}`);
    identities.add(roundIdentity(round));
    requireNumber(round.score, `${label}: score`, { min: 18, integer: true });
    requireNumber(round.putts, `${label}: putts`, { integer: true });
    if (round.putts > round.score) throw new Error(`${label}: round putts exceed gross strokes.`);
    for (const key of ['gir', 'fir']) {
      if (round[key] !== null) requireNumber(round[key], `${label}: ${key}`, { max: 100 });
    }
    if (round.scoreValue !== null) requireNumber(round.scoreValue, `${label}: Score Value`, { min: -20 });
    if (round.adjustedGross != null) requireNumber(round.adjustedGross, `${label}: adjusted gross`, { min: 18, integer: true });
    if (round.estimatedLostStrokes != null) requireNumber(round.estimatedLostStrokes, `${label}: estimated lost strokes`, { min: 0 });
    if (round.holes === null) continue;
    if (!Array.isArray(round.holes) || round.holes.length !== 18) throw new Error(`${label}: incomplete hole detail.`);
    requireGrid(round.holes.map((hole) => hole.par), `${label}: par`, { min: 3, max: 6, integer: true });
    requireGrid(round.holes.map((hole) => hole.strokes), `${label}: strokes`, { min: 1, integer: true });
    requireGrid(round.holes.map((hole) => hole.putts), `${label}: putts`, { integer: true });
    round.holes.forEach((hole, index) => {
      if (hole.number !== index + 1) throw new Error(`${label}: holes must be ordered 1 through 18.`);
      if (hole.putts > hole.strokes) throw new Error(`${label}: putts exceed strokes at hole ${hole.number}.`);
      if (hole.yards != null) requireNumber(hole.yards, `${label}: yards`, { min: 1, integer: true });
      if (hole.strokeIndex != null) requireNumber(hole.strokeIndex, `${label}: stroke index`, { min: 1, max: 18, integer: true });
      if (hole.adjustedStrokes != null) requireNumber(hole.adjustedStrokes, `${label}: adjusted strokes`, { min: 1, integer: true });
      if (hole.adjustedStrokes != null && hole.adjustedStrokes > hole.strokes) {
        throw new Error(`${label}: adjusted strokes exceed gross strokes at hole ${hole.number}.`);
      }
      if (hole.gir != null && typeof hole.gir !== 'boolean') throw new Error(`${label}: GIR must be true, false, or null.`);
      if (hole.teeAccuracy != null && !['hit', 'left', 'right', 'short', 'long', 'missed', 'unknown'].includes(hole.teeAccuracy)) {
        throw new Error(`${label}: unsupported tee accuracy at hole ${hole.number}.`);
      }
      if (hole.penaltyCodes != null && (typeof hole.penaltyCodes !== 'string' || !/^[SFHOD]*$/.test(hole.penaltyCodes))) {
        throw new Error(`${label}: unsupported event codes at hole ${hole.number}.`);
      }
    });
    if (sum(round.holes.map((hole) => hole.strokes)) !== round.score) throw new Error(`${label}: hole strokes do not match gross score.`);
    if (sum(round.holes.map((hole) => hole.putts)) !== round.putts) throw new Error(`${label}: hole putts do not match round putts.`);
    const hasAdjustedStrokes = round.holes.some((hole) => hole.adjustedStrokes != null);
    if (hasAdjustedStrokes) {
      if (round.holes.some((hole) => hole.adjustedStrokes == null)) throw new Error(`${label}: adjusted strokes must cover all 18 holes when provided.`);
      if (round.adjustedGross == null) throw new Error(`${label}: adjusted strokes require a displayed adjusted gross total.`);
      if (sum(round.holes.map((hole) => hole.adjustedStrokes)) !== round.adjustedGross) {
        throw new Error(`${label}: adjusted hole strokes do not match displayed adjusted gross.`);
      }
    }
    const fullHoleGir = round.holes.every((hole) => typeof hole.gir === 'boolean');
    if (fullHoleGir && round.gir !== null && Math.round(percent(round.holes.filter((hole) => hole.gir).length, 18)) !== Math.round(round.gir)) {
      throw new Error(`${label}: full hole GIR does not match rounded round GIR.`);
    }
  }
  return rounds;
}

export function scoringBucket(overPar) {
  if (overPar < -1) return 'eagleOrBetter';
  if (overPar === -1) return 'birdie';
  if (overPar === 0) return 'par';
  if (overPar === 1) return 'bogey';
  if (overPar === 2) return 'double';
  return 'triplePlus';
}

export function describeHoles(holes) {
  const distribution = { eagleOrBetter: 0, birdie: 0, par: 0, bogey: 0, double: 0, triplePlus: 0 };
  const putting = { zero: 0, one: 0, two: 0, three: 0, fourPlus: 0 };
  let excessPutts = 0;
  let aboveDouble = 0;
  for (const hole of holes) {
    const overPar = hole.strokes - hole.par;
    distribution[scoringBucket(overPar)]++;
    const puttingBucket = ['zero', 'one', 'two', 'three'][hole.putts] ?? 'fourPlus';
    putting[puttingBucket]++;
    excessPutts += Math.max(0, hole.putts - 2);
    aboveDouble += Math.max(0, overPar - 2);
  }
  return {
    count: holes.length,
    strokes: sum(holes.map((hole) => hole.strokes)),
    par: sum(holes.map((hole) => hole.par)),
    putts: sum(holes.map((hole) => hole.putts)),
    overPar: sum(holes.map((hole) => hole.strokes - hole.par)),
    averageOverPar: mean(holes.map((hole) => hole.strokes - hole.par)),
    averagePutts: mean(holes.map((hole) => hole.putts)),
    distribution,
    putting,
    threePlusCount: putting.three + putting.fourPlus,
    threePlusRate: percent(putting.three + putting.fourPlus, holes.length),
    triplePlusRate: percent(distribution.triplePlus, holes.length),
    excessPutts,
    aboveDouble,
  };
}

export function rollingAverage(rounds, metric, windowSize = 3) {
  if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error('Rolling window must be a positive integer.');
  return rounds.map((round, index) => {
    const window = rounds.slice(Math.max(0, index - windowSize + 1), index + 1);
    return {
      date: round.date,
      value: window.length === windowSize ? mean(window.map((item) => item[metric])) : null,
    };
  });
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function correlation(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const xMean = mean(xs);
  const yMean = mean(ys);
  const numerator = sum(xs.map((x, i) => (x - xMean) * (ys[i] - yMean)));
  const denominator = Math.sqrt(sum(xs.map((x) => (x - xMean) ** 2)) * sum(ys.map((y) => (y - yMean) ** 2)));
  return denominator ? numerator / denominator : null;
}

export function analyze(rounds) {
  validateRounds(rounds);
  const chronological = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const detailed = chronological.filter((round) => round.holes !== null);
  const allHoles = detailed.flatMap((round) => round.holes.map((hole) => ({
    ...hole, date: round.date, course: round.course, tee: round.tee,
  })));
  const holeStats = describeHoles(allHoles);
  const stages = [
    { name: 'Opening', range: '1-6', start: 1, end: 6 },
    { name: 'Middle', range: '7-12', start: 7, end: 12 },
    { name: 'Closing', range: '13-18', start: 13, end: 18 },
  ].map((stage) => ({
    ...stage,
    ...describeHoles(allHoles.filter((hole) => hole.number >= stage.start && hole.number <= stage.end)),
    rounds: detailed.length,
  }));
  const parTypes = [3, 4, 5].map((par) => ({ ...describeHoles(allHoles.filter((hole) => hole.par === par)), par }));
  const n = chronological.length;
  const thirds = [0, 1, 2].map((index) => {
    const start = Math.floor(index * n / 3);
    const end = Math.floor((index + 1) * n / 3);
    const group = chronological.slice(start, end);
    return { label: ['Early season', 'Middle season', 'Late season'][index], rounds: group.length, average: mean(group.map((round) => round.score)), dates: group.map((round) => round.date) };
  });
  const courses = [...new Set(chronological.map((round) => round.course))].map((name) => {
    const selected = chronological.filter((round) => round.course === name);
    return {
      name, count: selected.length, average: mean(selected.map((round) => round.score)),
      best: Math.min(...selected.map((round) => round.score)), putts: mean(selected.map((round) => round.putts)),
      rounds: selected,
    };
  });
  const repeatedHoles = [];
  const grouped = new Map();
  for (const hole of allHoles) {
    // Hole number alone is not an identity: keep both course and played tee.
    const key = `${hole.course}|${hole.tee}|${hole.number}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(hole);
  }
  for (const group of grouped.values()) {
    repeatedHoles.push({
      ...describeHoles(group),
      course: group[0].course, tee: group[0].tee, number: group[0].number,
      par: group[0].par, rounds: group.length,
    });
  }
  const directionHoles = allHoles.filter((hole) => hole.teeAccuracy != null);
  const directions = ['hit', 'left', 'right', 'short', 'long', 'missed', 'unknown'].map((direction) => ({
    direction, count: directionHoles.filter((hole) => hole.teeAccuracy === direction).length,
  }));
  const lengthBands = [
    { label: 'Under 350 yd', min: 0, max: 350 },
    { label: '350-399 yd', min: 350, max: 400 },
    { label: '400+ yd', min: 400, max: Infinity },
  ].map((band) => {
    const selected = allHoles.filter((hole) => hole.par === 4 && hole.yards !== null && hole.yards >= band.min && hole.yards < band.max);
    return { label: band.label, ...describeHoles(selected), courses: [...new Set(selected.map((hole) => hole.course))].length };
  });
  const first = chronological[0];
  const last = chronological.at(-1);
  const firstHalf = allHoles.filter((hole) => hole.number <= 9);
  const secondHalf = allHoles.filter((hole) => hole.number > 9);
  return {
    chronological, detailed, allHoles, holeStats, stages, parTypes, thirds, courses, repeatedHoles, directions, lengthBands,
    directionCoverage: { holes: directionHoles.length, rounds: new Set(directionHoles.map(roundIdentity)).size },
    summary: {
      count: n, detailed: detailed.length, courseCount: courses.length,
      average: mean(chronological.map((round) => round.score)),
      median: median(chronological.map((round) => round.score)),
      putts: mean(chronological.map((round) => round.putts)),
      best: chronological.reduce((best, round) => round.score < best.score ? round : best),
      worst: chronological.reduce((worst, round) => round.score > worst.score ? round : worst),
      gir: mean(chronological.filter((round) => round.gir !== null).map((round) => round.gir)),
      girCount: chronological.filter((round) => round.gir !== null).length,
      fir: mean(chronological.filter((round) => round.fir !== null).map((round) => round.fir)),
      firCount: chronological.filter((round) => round.fir !== null).length,
      startDate: first.date, endDate: last.date,
      sub100: chronological.filter((round) => round.score < 100).length,
      firstHalf: describeHoles(firstHalf), secondHalf: describeHoles(secondHalf),
      puttScoreCorrelation: correlation(chronological.map((round) => round.putts), chronological.map((round) => round.score)),
    },
  };
}

export function courseHoleGroups(analysis, research) {
  const groups = new Map();
  for (const hole of analysis.allHoles) {
    const course = research.courses.find((entry) => entry.name === hole.course);
    const description = course?.holes.find((entry) => entry.number === hole.number);
    if (!description || description.confidence !== 'explicit' || !['dogleg-left', 'dogleg-right', 'straight'].includes(description.shape)) continue;
    if (!groups.has(description.shape)) groups.set(description.shape, []);
    groups.get(description.shape).push(hole);
  }
  return [...groups].map(([shape, holes]) => ({
    shape, ...describeHoles(holes),
    uniqueHoles: new Set(holes.map((hole) => `${hole.course}|${hole.number}`)).size,
    courses: new Set(holes.map((hole) => hole.course)).size,
  }));
}
