import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateRounds } from '../../golf/analysis.mjs';

const [inputPath, coursePath] = process.argv.slice(2);
const nullable = (value) => value === undefined ? null : value;

function requiredHoleGrid(holes, key) {
  if (!Array.isArray(holes?.[key]) || holes[key].length !== 18) {
    throw new Error(`Hole ${key} must contain exactly 18 entries.`);
  }
  return holes[key];
}

function optionalHoleGrid(holes, key) {
  const values = holes?.[key];
  if (values === undefined || values === null) return null;
  if (!Array.isArray(values) || values.length !== 18) throw new Error(`Optional hole ${key} must contain exactly 18 entries when provided.`);
  return values;
}

export function buildRounds(raw) {
  if (!Array.isArray(raw?.rounds)) throw new Error('Round export must include a rounds array.');
  return raw.rounds.map((round) => {
    if (!round.holes) {
      return {
        date: round.date,
        course: round.course,
        tee: round.tee,
        score: round.history.score,
        putts: round.history.putts,
        gir: nullable(round.history.gir_percent),
        fir: nullable(round.history.fir_percent),
        scoreValue: nullable(round.history.score_value),
        adjustedGross: nullable(round.summary?.displayed_adjusted_gross_totals?.total_score),
        estimatedLostStrokes: nullable(round.summary?.penalty_row_total_value_observed),
        detailSource: 'Round summary only; the detailed scorecard was not available.',
        holes: null,
      };
    }

    const par = requiredHoleGrid(round.holes, 'par');
    const strokes = requiredHoleGrid(round.holes, 'strokes');
    const putts = requiredHoleGrid(round.holes, 'putts');
    const yards = optionalHoleGrid(round.holes, 'yards');
    const strokeIndex = optionalHoleGrid(round.holes, 'stroke_index');
    const teeAccuracy = optionalHoleGrid(round.holes, 'tee_accuracy');
    const gir = optionalHoleGrid(round.holes, 'gir');
    const adjustedStrokes = optionalHoleGrid(round.holes, 'adjusted_gross_strokes');
    const penaltyCodes = optionalHoleGrid(round.holes, 'penalty_codes');

    return {
      date: round.date,
      course: round.course,
      tee: round.tee,
      score: round.history.score,
      putts: round.history.putts,
      gir: nullable(round.history.gir_percent),
      fir: nullable(round.history.fir_percent),
      scoreValue: nullable(round.history.score_value),
      adjustedGross: nullable(round.summary?.displayed_adjusted_gross_totals?.total_score),
      estimatedLostStrokes: nullable(round.summary?.penalty_row_total_value_observed),
      detailSource: 'Captured scorecard; gross strokes and putts reconcile to the round total.',
      holes: par.map((holePar, index) => ({
        number: index + 1,
        par: holePar,
        strokes: strokes[index],
        putts: putts[index],
        yards: nullable(yards?.[index]),
        strokeIndex: nullable(strokeIndex?.[index]),
        teeAccuracy: nullable(teeAccuracy?.[index]),
        gir: nullable(gir?.[index]),
        adjustedStrokes: nullable(adjustedStrokes?.[index]),
        penaltyCodes: nullable(penaltyCodes?.[index]),
      })),
    };
  });
}

async function main() {
  if (!inputPath || !coursePath) throw new Error('Usage: node build-data.mjs <round-export.json> <course-research.json>');
  const raw = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const research = JSON.parse(await readFile(resolve(coursePath), 'utf8'));
  const rounds = buildRounds(raw);
  validateRounds(rounds);
  if (!Array.isArray(research.courses)) throw new Error('Course research must include a courses array.');
  for (const course of research.courses) {
    if (!course.name || !Array.isArray(course.sources) || !Array.isArray(course.holes)) throw new Error('Incomplete course research entry.');
    for (const source of course.sources) {
      if (!['http:', 'https:'].includes(new URL(source.url).protocol)) throw new Error('Only HTTP(S) research sources are allowed.');
    }
    const numbers = new Set();
    course.holes = course.holes.map((hole) => {
      const number = Number(hole.number);
      if (!Number.isInteger(number) || number < 1 || number > 18 || numbers.has(number)) {
        throw new Error(`${course.name}: invalid or duplicate research hole number ${hole.number}.`);
      }
      numbers.add(number);
      if (!['unknown', 'straight', 'dogleg-left', 'dogleg-right'].includes(hole.shape)) throw new Error(`${course.name}, hole ${number}: unknown shape classification.`);
      if (!['explicit', 'map-inference'].includes(hole.confidence)) throw new Error(`${course.name}, hole ${number}: missing evidence classification.`);
      if (!['http:', 'https:'].includes(new URL(hole.sourceUrl).protocol)) throw new Error(`${course.name}, hole ${number}: invalid source URL.`);
      return { ...hole, number };
    });
  }
  // Publish performance fields only, never account identities, browser routes, or local paths.
  const payload = {
    schemaVersion: 1,
    title: '2026 season report',
    through: [...rounds].map((round) => round.date).sort().at(-1),
    generatedAt: new Date().toISOString(),
    rounds,
    research,
  };
  const destination = fileURLToPath(new URL('../../golf/data.json', import.meta.url));
  await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Built ${rounds.length} rounds; ${rounds.filter((round) => round.holes).length} detailed scorecards -> ${destination}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
