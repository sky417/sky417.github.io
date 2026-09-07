import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, validateRounds, describeHoles, rollingAverage, courseHoleGroups, improvementEvidence } from '../../golf/analysis.mjs';
import { buildRounds } from './build-data.mjs';

const makeRound = (overrides = {}) => ({
  date: '2026-09-06', course: 'Test Course', tee: 'White', score: 90, putts: 36, gir: 0, fir: null, scoreValue: null, adjustedGross: null,
  holes: Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: 4, strokes: 5, putts: 2, yards: null, gir: null, teeAccuracy: null })),
  ...overrides,
});

test('validates gross strokes, putts, and complete hole arrays independently', () => {
  assert.equal(validateRounds([makeRound()]).length, 1);
  assert.throws(() => validateRounds([makeRound({ score: 89 })]), /gross score/);
  assert.throws(() => validateRounds([makeRound({ putts: 35 })]), /round putts/);
  assert.throws(() => validateRounds([makeRound({ holes: [] })]), /incomplete hole/);
  assert.throws(() => validateRounds([makeRound({ gir: undefined })]), /gir/);
});

test('summary-only rounds do not invent hole detail or turn missing GIR into zero', () => {
  const report = analyze([makeRound({ holes: null, gir: null }), makeRound({ date: '2026-09-05', gir: 0 })]);
  assert.equal(report.summary.count, 2);
  assert.equal(report.summary.detailed, 1);
  assert.equal(report.summary.gir, 0);
  assert.equal(report.summary.girCount, 1);
  assert.equal(report.allHoles.length, 18);
  assert.throws(() => validateRounds([makeRound({ holes: null, adjustedGross: '<img>' })]), /adjusted gross/);
});

test('stages compare strokes relative to par using equal six-hole samples', () => {
  const round = makeRound();
  round.holes[0].par = 5;
  round.holes[0].strokes = 6;
  round.score++;
  const report = analyze([round]);
  for (const stage of report.stages) {
    assert.equal(stage.count, 6);
    assert.equal(stage.averageOverPar, 1);
  }
});

test('counts four-putts as three-plus holes but two excess putts', () => {
  const stats = describeHoles([{ par: 4, strokes: 7, putts: 4 }, { par: 3, strokes: 3, putts: 1 }]);
  assert.equal(stats.threePlusCount, 1);
  assert.equal(stats.excessPutts, 2);
  assert.equal(stats.aboveDouble, 1);
  assert.equal(stats.distribution.triplePlus, 1);
});

test('rolling average waits for a full window and does not mutate chronological data', () => {
  const rows = [{ date: 'a', score: 90 }, { date: 'b', score: 99 }, { date: 'c', score: 96 }];
  assert.deepEqual(rollingAverage(rows, 'score').map((point) => point.value), [null, null, 95]);
  assert.throws(() => rollingAverage(rows, 'score', 0), /positive/);
});

test('keeps repeated hole identities separate by course and tee', () => {
  const report = analyze([makeRound(), makeRound({ date: '2026-09-05', tee: 'Blue' }), makeRound({ date: '2026-09-04', course: 'Other Course' })]);
  assert.equal(report.repeatedHoles.length, 54);
  assert.ok(report.repeatedHoles.every((hole) => hole.rounds === 1));
});

test('same-day rounds with different tees retain independent identities and direction coverage', () => {
  const first = makeRound();
  const second = makeRound({ tee: 'Blue' });
  first.holes[0].teeAccuracy = 'hit';
  second.holes[0].teeAccuracy = 'left';
  const report = analyze([first, second]);
  assert.equal(report.summary.count, 2);
  assert.equal(report.directionCoverage.rounds, 2);
  assert.equal(report.directionCoverage.holes, 2);
});

test('par category labels and repeated-hole pars are not overwritten by aggregate par sums', () => {
  const report = analyze([makeRound(), makeRound({ date: '2026-09-05' })]);
  assert.deepEqual(report.parTypes.map((group) => group.par), [3, 4, 5]);
  assert.ok(report.repeatedHoles.every((hole) => hole.par === 4 && hole.rounds === 2));
  assert.equal(report.summary.firstHalf.par, 72);
});

test('shape analysis excludes unknown geometry and map-only inference', () => {
  const report = analyze([makeRound()]);
  const research = { courses: [{ name: 'Test Course', holes: [
    { number: 1, shape: 'dogleg-left', confidence: 'explicit' },
    { number: 2, shape: 'dogleg-right', confidence: 'map-inference' },
  ] }] };
  const groups = courseHoleGroups(report, research);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].uniqueHoles, 1);
});

test('zero-detail filters have honest null rates and no divide-by-zero', () => {
  const report = analyze([makeRound({ holes: null })]);
  assert.equal(report.holeStats.threePlusRate, null);
  assert.equal(report.holeStats.averageOverPar, null);
  assert.equal(report.summary.detailed, 0);
  assert.equal(report.stages[0].count, 0);
});

test('rejects impossible calendar dates, impossible round putts, and unmapped direction codes', () => {
  assert.throws(() => validateRounds([makeRound({ date: '2026-02-30' })]), /Invalid round date/);
  assert.throws(() => validateRounds([makeRound({ holes: null, putts: 100 })]), /round putts exceed/);
  const round = makeRound();
  round.holes[0].teeAccuracy = 'arrow';
  assert.throws(() => validateRounds([round]), /unsupported tee accuracy/);
});

test('September 6 uses gross 109, not adjusted gross 108, for performance analysis', () => {
  const pars = [4,4,3,5,4,4,3,4,4,4,4,3,4,5,4,4,3,5];
  const strokes = [6,5,5,8,6,6,4,5,6,6,6,5,7,7,6,9,5,7];
  const putts = [3,2,2,2,2,2,2,3,3,2,2,3,1,2,3,2,2,2];
  const adjustedStrokes = [...strokes];
  adjustedStrokes[15] = 8;
  const round = makeRound({ score: 109, putts: 40, adjustedGross: 108 });
  round.holes = round.holes.map((hole, index) => ({
    ...hole, par: pars[index], strokes: strokes[index], putts: putts[index], adjustedStrokes: adjustedStrokes[index],
  }));
  const report = analyze([round]);
  assert.equal(report.summary.average, 109);
  assert.equal(report.summary.firstHalf.strokes, 51);
  assert.equal(report.summary.secondHalf.strokes, 58);
  assert.equal(round.holes[13].strokes, 7);
  assert.equal(round.holes[13].adjustedStrokes, 7);
  assert.equal(round.holes[15].strokes, 9);
  assert.equal(round.holes[15].adjustedStrokes, 8);
  assert.deepEqual(report.holeStats.distribution, { eagleOrBetter: 0, birdie: 0, par: 0, bogey: 3, double: 12, triplePlus: 3 });
});

test('accepts optional supplementary fields while preserving explicit zero and blank event records', () => {
  const round = makeRound({ adjustedGross: 90, estimatedLostStrokes: 0 });
  round.holes = round.holes.map((hole, index) => ({
    ...hole,
    strokeIndex: index + 1,
    adjustedStrokes: hole.strokes,
    gir: false,
    penaltyCodes: index === 0 ? '' : null,
  }));
  assert.equal(validateRounds([round])[0].estimatedLostStrokes, 0);
  assert.equal(round.holes[0].penaltyCodes, '');
});

test('omitted legacy optional fields do not invent direction coverage', () => {
  const round = makeRound();
  delete round.adjustedGross;
  for (const hole of round.holes) delete hole.teeAccuracy;
  const report = analyze([round]);
  assert.deepEqual(report.directionCoverage, { holes: 0, rounds: 0 });
  assert.ok(report.directions.every((direction) => direction.count === 0));
});

test('validates supplementary values and reconciles complete adjusted and GIR grids', () => {
  const round = makeRound({ adjustedGross: 90, gir: 0 });
  round.holes = round.holes.map((hole, index) => ({
    ...hole,
    strokeIndex: index + 1,
    adjustedStrokes: hole.strokes,
    gir: false,
    penaltyCodes: index === 0 ? 'FS' : null,
  }));
  assert.equal(validateRounds([round]).length, 1);

  const invalidIndex = structuredClone(round);
  invalidIndex.holes[0].strokeIndex = 19;
  assert.throws(() => validateRounds([invalidIndex]), /stroke index/);

  const invalidAdjusted = structuredClone(round);
  invalidAdjusted.holes[0].adjustedStrokes = 6;
  assert.throws(() => validateRounds([invalidAdjusted]), /adjusted strokes exceed/);

  const invalidEvent = structuredClone(round);
  invalidEvent.holes[0].penaltyCodes = 'X';
  assert.throws(() => validateRounds([invalidEvent]), /event codes/);

  const mismatchedGIR = structuredClone(round);
  mismatchedGIR.gir = 6;
  assert.throws(() => validateRounds([mismatchedGIR]), /full hole GIR/);
});

test('allows partial GIR grids but rejects partial adjusted grids and totals that do not reconcile', () => {
  const partialGir = makeRound({ gir: 100 });
  partialGir.holes[0].gir = true;
  assert.equal(validateRounds([partialGir]).length, 1);

  const partialAdjusted = makeRound({ adjustedGross: 90 });
  partialAdjusted.holes[0].adjustedStrokes = 5;
  assert.throws(() => validateRounds([partialAdjusted]), /adjusted strokes must cover/);

  const mismatchedAdjusted = makeRound({ adjustedGross: 89 });
  mismatchedAdjusted.holes = mismatchedAdjusted.holes.map((hole) => ({ ...hole, adjustedStrokes: 5 }));
  assert.throws(() => validateRounds([mismatchedAdjusted]), /adjusted hole strokes/);
});

test('builder preserves null, zero, and blank supplementary data and rejects malformed supplied grids', () => {
  const holes = {
    par: Array(18).fill(4),
    strokes: Array(18).fill(5),
    putts: Array(18).fill(2),
    yards: Array(18).fill(null),
    stroke_index: Array.from({ length: 18 }, (_, index) => index + 1),
    tee_accuracy: Array(18).fill(null),
    gir: Array(18).fill(false),
    adjusted_gross_strokes: Array(18).fill(5),
    penalty_codes: ['', ...Array(17).fill(null)],
  };
  const raw = {
    rounds: [{
      date: '2026-09-06',
      course: 'Test Course',
      tee: 'White',
      history: { score: 90, putts: 36, gir_percent: 0, fir_percent: null, score_value: null },
      summary: {
        displayed_adjusted_gross_totals: { total_score: 90 },
        penalty_row_total_value_observed: 0,
      },
      holes,
    }],
  };
  const [round] = buildRounds(raw);
  assert.equal(round.estimatedLostStrokes, 0);
  assert.equal(round.holes[0].penaltyCodes, '');
  assert.equal(round.holes[0].adjustedStrokes, 5);
  assert.equal(validateRounds([round]).length, 1);

  const unavailable = structuredClone(raw);
  delete unavailable.rounds[0].holes.adjusted_gross_strokes;
  delete unavailable.rounds[0].holes.penalty_codes;
  unavailable.rounds[0].summary.penalty_row_total_value_observed = null;
  const [unavailableRound] = buildRounds(unavailable);
  assert.ok(unavailableRound.holes.every((hole) => hole.adjustedStrokes === null && hole.penaltyCodes === null));
  assert.equal(unavailableRound.estimatedLostStrokes, null);

  for (const key of ['yards', 'stroke_index', 'adjusted_gross_strokes', 'penalty_codes']) {
    const malformed = structuredClone(raw);
    malformed.rounds[0].holes[key] = Array(17).fill(null);
    assert.throws(() => buildRounds(malformed), new RegExp(`${key} must contain exactly 18`));
  }
});

test('improvement baselines use gross hole data, not summary-only rounds or adjusted/lost strokes', () => {
  const round = makeRound({ score: 95, putts: 39, adjustedGross: 90, estimatedLostStrokes: 99 });
  round.holes[0].strokes = 7;
  round.holes[0].putts = 3;
  round.holes[1].strokes = 8;
  round.holes[1].putts = 4;
  const report = analyze([round, makeRound({ date: '2026-09-05', holes: null })]);
  const before = JSON.stringify(report);
  const evidence = improvementEvidence(report);
  assert.deepEqual(evidence.triples, { baseline: 2, target: 1 });
  assert.deepEqual(evidence.putting, { baseline: 2, target: 1 });
  assert.equal(report.holeStats.excessPutts, 3);
  assert.equal(JSON.stringify(report), before);
});

test('improvement evidence excludes unknown outcomes and par-3 tees while retaining false and blank observations', () => {
  const round = makeRound({ score: 88 });
  round.holes[0] = { ...round.holes[0], teeAccuracy: 'hit', gir: false, penaltyCodes: '' };
  round.holes[1] = { ...round.holes[1], par: 3, strokes: 3, teeAccuracy: 'hit', gir: true, penaltyCodes: 'DD' };
  round.holes[2] = { ...round.holes[2], teeAccuracy: 'left', gir: false, penaltyCodes: 'F' };
  round.holes[3] = { ...round.holes[3], par: 5, teeAccuracy: 'right', penaltyCodes: null };
  round.holes[4].teeAccuracy = 'unknown';
  delete round.holes[5].teeAccuracy;
  const evidence = improvementEvidence(analyze([round]));
  assert.equal(evidence.tee.eligible, 17);
  assert.equal(evidence.tee.observed, 3);
  assert.equal(evidence.tee.hits, 1);
  assert.equal(evidence.tee.left, 1);
  assert.equal(evidence.tee.right, 1);
  assert.equal(evidence.tee.missStats.count, 2);
  assert.equal(evidence.greens.observed, 3);
  assert.equal(evidence.greens.hits, 1);
  assert.equal(evidence.events.observed, 3);
  assert.equal(evidence.events.withCodes.count, 2);
  assert.equal(evidence.events.withoutCodes.count, 1);
  assert.equal(evidence.events.dropHoles, 1);
});

test('improvement watchlist requires repeated course, tee, and hole identities', () => {
  const report = analyze([makeRound(), makeRound({ date: '2026-09-05' }), makeRound({ tee: 'Blue' })]);
  const evidence = improvementEvidence(report);
  assert.deepEqual(evidence.watchlist.map((hole) => hole.number), [1, 2, 3]);
  assert.ok(evidence.watchlist.every((hole) => hole.rounds === 2 && hole.tee === 'White'));
});

test('improvement evidence distinguishes unavailable baselines from a zero-error record', () => {
  const missing = improvementEvidence(analyze([makeRound({ holes: null })]));
  assert.deepEqual(missing.triples, { baseline: null, target: null });
  assert.deepEqual(missing.putting, { baseline: null, target: null });
  assert.equal(missing.tee.rate, null);
  assert.equal(missing.greens.rate, null);
  assert.equal(missing.events.withCodes.averageOverPar, null);
  const zero = improvementEvidence(analyze([makeRound()]));
  assert.deepEqual(zero.triples, { baseline: 0, target: 0 });
  assert.deepEqual(zero.putting, { baseline: 0, target: 0 });
  assert.equal(zero.tee.observed, 0);
});
