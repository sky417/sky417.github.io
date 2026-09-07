import { analyze, rollingAverage, courseHoleGroups, roundIdentity } from './analysis.mjs';

const dom = {
  status: document.querySelector('#status'),
  report: document.querySelector('#report'),
  heroMeta: document.querySelector('#hero-meta'),
  courseFilter: document.querySelector('#course-filter'),
  resetFilter: document.querySelector('#reset-filter'),
  overview: document.querySelector('#overview-content'),
  trend: document.querySelector('#trend-content'),
  rhythm: document.querySelector('#rhythm-content'),
  holes: document.querySelector('#holes-content'),
  putting: document.querySelector('#putting-content'),
  dna: document.querySelector('#dna-content'),
  priorities: document.querySelector('#priorities-content'),
  method: document.querySelector('#method-content'),
};

const state = {
  payload: null,
  course: 'all',
  trendMetric: 'score',
  heatmapCourse: null,
  selectedRoundKey: null,
  dnaCourse: null,
  dnaHole: 1,
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const number = (value, digits = 1) => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  : '—';

const whole = (value) => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  : '—';

const percent = (value, digits = 1) => Number.isFinite(value) ? `${number(value, digits)}%` : '—';

const formatDate = (value, style = 'medium') => {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', style === 'short'
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  ).format(date);
};

const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const roundKey = roundIdentity;
const allResearch = () => Array.isArray(state.payload?.research?.courses) ? state.payload.research.courses : [];
const eventCodeGuide = {
  url: 'https://prd-webflow.thegrint.com/range/post/how-to-add-your-golf-score-using-thegrint',
  title: 'TheGrint score entry guide',
};
const lostStrokesGuide = {
  url: 'https://thegrint.com/range/post/thegrint-golf-scorecard-penalties',
  title: 'TheGrint lost-strokes estimate guide',
};

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function sourceLabel(source) {
  if (typeof source === 'string') {
    const url = safeUrl(source);
    return url ? new URL(url).hostname.replace(/^www\./, '') : 'Official source';
  }
  const url = safeUrl(source?.url);
  if (!url) return 'Official source';
  return source?.title || source?.name || source?.label || new URL(url).hostname.replace(/^www\./, '');
}

function sourceLink(source, fallback = 'Official source') {
  const raw = typeof source === 'string' ? source : source?.url;
  const url = safeUrl(raw);
  if (!url) return '';
  const label = sourceLabel(source) || fallback;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function getFilteredRounds() {
  if (!state.payload) return [];
  return state.course === 'all'
    ? state.payload.rounds
    : state.payload.rounds.filter((round) => round.course === state.course);
}

function currentAnalysis() {
  const rounds = getFilteredRounds();
  return rounds.length ? analyze(rounds) : null;
}

function setHtml(node, html) {
  node.innerHTML = html;
}

function emptyState(title, message) {
  return `<div class="empty-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;
}

function renderSelectOptions(values, selected, allLabel = null) {
  const options = [];
  if (allLabel !== null) options.push(`<option value="all"${selected === 'all' ? ' selected' : ''}>${escapeHtml(allLabel)}</option>`);
  for (const value of values) {
    options.push(`<option value="${escapeHtml(value)}"${selected === value ? ' selected' : ''}>${escapeHtml(value)}</option>`);
  }
  return options.join('');
}

function inlineSparkline(values, label) {
  if (!values.length) return '';
  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index / (values.length - 1) * (width - 6) + 3;
    const y = 4 + (max - value) / span * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="mini-series" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title><polyline points="${points}" fill="none" stroke="#17775f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function scoreClass(overPar) {
  if (overPar < 0) return 'score-under';
  if (overPar === 0) return 'score-even';
  if (overPar === 1) return 'score-bogey';
  if (overPar === 2) return 'score-double';
  if (overPar === 3) return 'score-triple';
  return 'score-severe';
}

function formatOverPar(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return 'E';
  return `${value > 0 ? '+' : ''}${number(value, digits)}`;
}

function renderHero(report) {
  const through = state.payload.through || report.summary.endDate;
  const coverage = report.summary.count
    ? report.summary.detailed / report.summary.count * 100
    : 0;
  setHtml(dom.heroMeta, `
    <span class="meta-chip">Through ${escapeHtml(formatDate(through))}</span>
    <span class="coverage-badge">${report.summary.detailed} of ${report.summary.count} rounds have score/putt hole detail · ${number(coverage, 0)}%</span>
  `);
}

function renderCourseFilter() {
  const courses = [...new Set(state.payload.rounds.map((round) => round.course))].sort();
  dom.courseFilter.innerHTML = renderSelectOptions(courses, state.course, `All courses · ${state.payload.rounds.length} rounds`);
  dom.courseFilter.disabled = false;
  dom.resetFilter.disabled = state.course === 'all';
}

function insightCards(report) {
  const cards = [];
  const spread = report.summary.worst.score - report.summary.best.score;
  cards.push({
    title: `${whole(spread)} strokes separate the best and highest selected scores.`,
    body: `${formatDate(report.summary.best.date, 'short')} at ${report.summary.best.course} set the low mark at ${report.summary.best.score}; ${report.summary.worst.score} was the high.`,
  });

  if (report.allHoles.length) {
    const parTypes = report.parTypes.filter((item) => item.count);
    const hardest = [...parTypes].sort((a, b) => b.averageOverPar - a.averageOverPar)[0];
    cards.push({
      title: `Par ${hardest.par}s carried the highest average cost: ${formatOverPar(hardest.averageOverPar)} per hole.`,
      body: `${plural(hardest.count, 'hole')} across ${plural(report.summary.detailed, 'detailed round')}; this describes the observed sample, not course difficulty in general.`,
    });
    const stageSorted = [...report.stages].filter((stage) => stage.count).sort((a, b) => b.averageOverPar - a.averageOverPar);
    const stage = stageSorted[0];
    const stageGap = stage.averageOverPar - stageSorted.at(-1).averageOverPar;
    cards.push({
      title: stageGap <= 0.1
        ? 'The opening, middle, and closing segments are closely matched.'
        : `${stage.name} holes had the highest average cost in this sample.`,
      body: stageGap <= 0.1
        ? `Only ${number(stageGap, 2)} strokes per hole separate the segment averages across ${plural(report.summary.detailed, 'detailed round')}. The records do not show a large early-to-late scoring shift.`
        : `${formatOverPar(stage.averageOverPar, 2)} per hole over ${plural(stage.count, 'recorded hole')}. That pattern alone does not establish fatigue or a swing cause.`,
    });
  } else {
    const puttRange = Math.max(...report.chronological.map((round) => round.putts)) - Math.min(...report.chronological.map((round) => round.putts));
    cards.push({
      title: `Putting totals span ${whole(puttRange)} strokes across the selected rounds.`,
      body: `Round totals are available, but no captured hole grids are available for a hole-by-hole explanation.`,
    });
    cards.push({
      title: `${report.summary.sub100} of ${report.summary.count} selected rounds finished below 100.`,
      body: 'That count uses gross score and includes every selected round.',
    });
  }

  return cards.slice(0, 3);
}

function renderOverview(report) {
  const summary = report.summary;
  const insights = insightCards(report);
  const coverage = summary.count ? summary.detailed / summary.count * 100 : 0;
  setHtml(dom.overview, `
    <div class="kpi-grid">
      <article class="kpi-card">
        <span class="kpi-card__label">Mean gross</span>
        <strong class="kpi-card__value">${number(summary.average, 1)}</strong>
        <span class="kpi-card__note">${plural(summary.count, 'round')} · every selected gross score</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Best round</span>
        <strong class="kpi-card__value">${whole(summary.best.score)}</strong>
        <span class="kpi-card__note">${escapeHtml(summary.best.course)} · ${escapeHtml(formatDate(summary.best.date, 'short'))}</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Mean putts</span>
        <strong class="kpi-card__value">${number(summary.putts, 1)}</strong>
        <span class="kpi-card__note">${plural(summary.count, 'round')} · reported round totals</span>
      </article>
      <article class="kpi-card">
        <span class="kpi-card__label">Rounds below 100</span>
        <strong class="kpi-card__value">${summary.sub100}<small> / ${summary.count}</small></strong>
        <span class="kpi-card__note">${percent(summary.sub100 / summary.count * 100, 0)} of selected rounds</span>
      </article>
    </div>
    <div class="insight-grid">
      ${insights.map((insight, index) => `
        <article class="insight-card">
          <span class="insight-card__index">OBSERVATION 0${index + 1}</span>
          <h3>${escapeHtml(insight.title)}</h3>
          <p>${escapeHtml(insight.body)}</p>
        </article>
      `).join('')}
    </div>
    <div class="coverage-strip">
      <strong>Detail coverage</strong>
      <div class="coverage-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, coverage))}%"></span></div>
      <p>${summary.detailed} score/putt grids / ${summary.count} total rounds. Hole analysis excludes the other ${summary.count - summary.detailed}; supplementary fields may have different coverage and are never treated as zero.</p>
    </div>
  `);
}

function trendSvg(rounds, metric) {
  const width = 780;
  const height = 350;
  const margin = { top: 36, right: 32, bottom: 52, left: 46 };
  const values = rounds.map((round) => round[metric]);
  const dates = rounds.map((round) => new Date(`${round.date}T12:00:00Z`).getTime());
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = Math.max(metric === 'score' ? 3 : 2, (dataMax - dataMin) * 0.12);
  const yMin = Math.floor(dataMin - padding);
  const yMax = Math.ceil(dataMax + padding);
  const dateMin = Math.min(...dates);
  const dateMax = Math.max(...dates);
  const x = (date) => margin.left + (dateMax === dateMin ? 0.5 : (date - dateMin) / (dateMax - dateMin)) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (yMax - value) / (yMax - yMin || 1) * (height - margin.top - margin.bottom);
  const linePoints = rounds.map((round, index) => `${x(dates[index]).toFixed(1)},${y(round[metric]).toFixed(1)}`).join(' ');
  const rolling = rollingAverage(rounds, metric, 3);
  const rollingPoints = rolling.map((point, index) => point.value === null ? null : `${x(dates[index]).toFixed(1)},${y(point.value).toFixed(1)}`).filter(Boolean).join(' ');
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, index) => yMin + (yMax - yMin) * index / (tickCount - 1));
  const xTickStep = Math.max(1, Math.ceil(rounds.length / 5));
  const xTickIndexes = rounds.map((_, index) => index).filter((index) => index % xTickStep === 0 || index === rounds.length - 1);
  const bestValue = Math.min(...values);
  const bestIndex = values.indexOf(bestValue);
  const metricLabel = metric === 'score' ? 'gross score' : 'putts';
  const title = `${metric === 'score' ? 'Gross score' : 'Putts'} by round date with three-round rolling mean`;

  return `
    <div class="chart-scroll" tabindex="0" role="region" aria-label="Scrollable season trend chart">
    <svg class="chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
      <title>${escapeHtml(title)}</title>
      ${yTicks.map((tick) => `
        <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"/>
        <text x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${whole(tick)}</text>
      `).join('')}
      <line class="axis-line" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>
      ${xTickIndexes.map((index) => `
        <text x="${x(dates[index])}" y="${height - 22}" text-anchor="middle">${escapeHtml(formatDate(rounds[index].date, 'short'))}</text>
      `).join('')}
      <polyline class="series-line" points="${linePoints}"/>
      ${rollingPoints ? `<polyline class="rolling-line" points="${rollingPoints}"/>` : ''}
      ${rounds.map((round, index) => `
        <circle class="series-dot${index === bestIndex ? ' best-dot' : ''}" cx="${x(dates[index])}" cy="${y(round[metric])}" r="${index === bestIndex ? 5 : 4}">
          <title>${escapeHtml(`${formatDate(round.date)} · ${round.course} · ${round[metric]} ${metricLabel}`)}</title>
        </circle>
      `).join('')}
      <path d="M${x(dates[bestIndex])} ${y(bestValue) - 8}v-16" stroke="#123b32" stroke-width="1"/>
      <text x="${x(dates[bestIndex])}" y="${y(bestValue) - 30}" text-anchor="middle" fill="#123b32">Low ${bestValue}</text>
    </svg>
    </div>
    <table class="sr-only">
      <caption>${escapeHtml(title)}</caption>
      <thead><tr><th>Date</th><th>Course</th><th>${escapeHtml(metricLabel)}</th><th>3-round mean</th></tr></thead>
      <tbody>${rounds.map((round, index) => `<tr><td>${escapeHtml(round.date)}</td><td>${escapeHtml(round.course)}</td><td>${round[metric]}</td><td>${rolling[index].value === null ? 'Not available' : number(rolling[index].value, 1)}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function repeatedCourseTable(report) {
  const repeated = report.courses
    .filter((course) => course.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!repeated.length) return emptyState('No repeated course in this view', 'Select all courses or a course with at least two rounds to compare changes.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Course</th><th>Rounds</th><th>Gross series</th><th>Putts series</th><th>First → latest</th></tr>
        </thead>
        <tbody>
          ${repeated.map((course) => {
            const rounds = course.rounds;
            const first = rounds[0];
            const last = rounds.at(-1);
            const grossDelta = last.score - first.score;
            const puttDelta = last.putts - first.putts;
            const nonPuttingDelta = (last.score - last.putts) - (first.score - first.putts);
            return `
              <tr>
                <td><strong>${escapeHtml(course.name)}</strong></td>
                <td>${course.count}</td>
                <td>${inlineSparkline(rounds.map((round) => round.score), `${course.name} gross scores: ${rounds.map((round) => round.score).join(', ')}`)}</td>
                <td>${inlineSparkline(rounds.map((round) => round.putts), `${course.name} putts: ${rounds.map((round) => round.putts).join(', ')}`)}</td>
                <td>
                  Gross ${grossDelta > 0 ? '+' : ''}${grossDelta};
                  putts ${puttDelta > 0 ? '+' : ''}${puttDelta};
                  non-putting ${nonPuttingDelta > 0 ? '+' : ''}${nonPuttingDelta}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="note">“Non-putting strokes” means gross score minus total putts. It is a descriptive remainder—not strokes gained and not a measure of ball-striking quality.</p>
  `;
}

function renderTrend(report) {
  const metric = state.trendMetric;
  setHtml(dom.trend, `
    <div class="panel-grid">
      <article class="panel">
        <div class="panel__head">
          <div>
            <h3>${metric === 'score' ? 'Gross score' : 'Total putts'} by date</h3>
            <p>${plural(report.chronological.length, 'round')} · lower is better</p>
          </div>
          <div class="segmented" aria-label="Trend metric">
            <button type="button" data-trend-metric="score" aria-pressed="${metric === 'score'}">Gross</button>
            <button type="button" data-trend-metric="putts" aria-pressed="${metric === 'putts'}">Putts</button>
          </div>
        </div>
        ${trendSvg(report.chronological, metric)}
        <ul class="chart-legend" aria-hidden="true">
          <li><i class="legend-key"></i> Individual round</li>
          <li><i class="legend-key legend-key--rolling"></i> 3-round rolling mean</li>
        </ul>
      </article>
      <article class="panel">
        <div class="panel__head">
          <div>
            <h3>Chronological thirds</h3>
            <p>Equal-sized date-ordered groups</p>
          </div>
        </div>
        <div class="thirds-grid">
          ${report.thirds.map((third) => `
            <article class="third-card">
              <span class="third-card__label">${escapeHtml(third.label)}</span>
              <strong>${number(third.average, 1)}</strong>
              <small>${plural(third.rounds, 'round')}${third.dates.length ? `<br>${escapeHtml(formatDate(third.dates[0], 'short'))}–${escapeHtml(formatDate(third.dates.at(-1), 'short'))}` : ''}</small>
            </article>
          `).join('')}
        </div>
        <p class="note">Course and tee mix changes across the season, and each third is small. Differences are descriptive—not proof of improvement or decline.</p>
      </article>
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <div>
          <h3>Repeated-course changes</h3>
          <p>First-to-latest comparisons within each course, using actual chronology.</p>
        </div>
      </div>
      ${repeatedCourseTable(report)}
    </div>
  `);
}

function renderRhythm(report) {
  if (!report.allHoles.length) {
    setHtml(dom.rhythm, emptyState('No hole grids in this filter', 'Round rhythm requires complete hole-by-hole scores. Summary rounds remain represented in overview and trend sections.'));
    return;
  }
  const max = Math.max(...report.stages.map((stage) => stage.averageOverPar || 0), 0.1);
  const front = report.summary.firstHalf;
  const back = report.summary.secondHalf;
  const frontAverage = front.count ? front.overPar / report.summary.detailed : null;
  const backAverage = back.count ? back.overPar / report.summary.detailed : null;
  setHtml(dom.rhythm, `
    <div class="rhythm-bars">
      ${report.stages.map((stage) => `
        <article class="rhythm-card">
          <div class="rhythm-card__top">
            <h3>${escapeHtml(stage.name)}</h3>
            <span class="rhythm-card__range">Holes ${escapeHtml(stage.range)}</span>
          </div>
          <strong class="rhythm-card__value">${formatOverPar(stage.averageOverPar)} <small>/ hole</small></strong>
          <div class="rhythm-card__track" aria-hidden="true"><span style="width:${stage.averageOverPar / max * 100}%"></span></div>
          <p>${plural(stage.count, 'hole')} from ${plural(stage.rounds, 'detailed round')}</p>
        </article>
      `).join('')}
    </div>
    <div class="panel panel-grid panel-grid--equal">
      <div>
        <div class="panel__head">
          <div><h3>Front nine</h3><p>Average relative-to-par total per detailed round</p></div>
        </div>
        <div class="callout-metric">
          <span>Holes 1–9</span>
          <strong>${formatOverPar(frontAverage)}</strong>
          <p>${front.count} hole observations / ${report.summary.detailed} detailed rounds.</p>
        </div>
      </div>
      <div>
        <div class="panel__head">
          <div><h3>Back nine</h3><p>Average relative-to-par total per detailed round</p></div>
        </div>
        <div class="callout-metric">
          <span>Holes 10–18</span>
          <strong>${formatOverPar(backAverage)}</strong>
          <p>${back.count} hole observations / ${report.summary.detailed} detailed rounds.</p>
        </div>
      </div>
    </div>
    <p class="note">A larger closing value is a location in the scorecard, not a fatigue diagnosis. Weather, course sequence, par, hole length, and layout are mixed together.</p>
  `);
}

function preferredHeatmapCourse(report) {
  const counts = new Map();
  for (const round of report.detailed) counts.set(round.course, (counts.get(round.course) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

function heatmapHtml(report) {
  const available = [...new Set(report.detailed.map((round) => round.course))].sort();
  if (!available.length) return emptyState('No detailed course available', 'This filter has round summaries but no captured hole grids.');
  if (!available.includes(state.heatmapCourse)) state.heatmapCourse = preferredHeatmapCourse(report);
  const rounds = report.detailed.filter((round) => round.course === state.heatmapCourse);
  const cells = [
    '<div class="heatmap__head">Round</div>',
    ...Array.from({ length: 18 }, (_, index) => `<div class="heatmap__head">${index + 1}</div>`),
  ];
  for (const round of rounds) {
    cells.push(`<div class="heatmap__label"><span title="${escapeHtml(`${formatDate(round.date)} · ${round.tee}`)}">${escapeHtml(formatDate(round.date, 'short'))} · ${escapeHtml(round.tee)}</span></div>`);
    for (const hole of round.holes) {
      const overPar = hole.strokes - hole.par;
      const title = `${round.course}, ${formatDate(round.date)}, hole ${hole.number}: par ${hole.par}, ${hole.strokes} strokes, ${hole.putts} putts, ${formatOverPar(overPar, 0)}`;
      cells.push(`<div class="heatmap__cell ${scoreClass(overPar)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${formatOverPar(overPar, 0)}</div>`);
    }
  }
  return `
    <div class="panel">
      <div class="panel__head">
        <div>
          <h3>Course score heatmap</h3>
          <p>${plural(rounds.length, 'detailed round')} at one course · gross strokes relative to par</p>
        </div>
        <label>
          <span class="sr-only">Heatmap course</span>
          <select data-control="heatmap-course">${renderSelectOptions(available, state.heatmapCourse)}</select>
        </label>
      </div>
      <div class="heatmap-shell" tabindex="0" aria-label="Horizontally scrollable course score heatmap">
        <div class="heatmap">${cells.join('')}</div>
      </div>
      <div class="heatmap-legend" aria-hidden="true">
        <span><i class="score-under"></i> Under par</span>
        <span><i class="score-even"></i> Even</span>
        <span><i class="score-bogey"></i> +1</span>
        <span><i class="score-double"></i> +2</span>
        <span><i class="score-triple"></i> +3</span>
        <span><i class="score-severe"></i> +4 or more</span>
      </div>
    </div>
  `;
}

function selectedRoundHtml(report) {
  if (!report.detailed.length) return '';
  const keys = new Set(report.detailed.map(roundKey));
  if (!keys.has(state.selectedRoundKey)) {
    const initial = report.detailed.find((round) => round.course === state.heatmapCourse) || report.detailed.at(-1);
    state.selectedRoundKey = roundKey(initial);
  }
  const round = report.detailed.find((item) => roundKey(item) === state.selectedRoundKey);
  const frontScore = sum(round.holes.slice(0, 9).map((hole) => hole.strokes));
  const backScore = sum(round.holes.slice(9).map((hole) => hole.strokes));
  const frontPutts = sum(round.holes.slice(0, 9).map((hole) => hole.putts));
  const backPutts = sum(round.holes.slice(9).map((hole) => hole.putts));
  const numericSummary = (values) => values.every(Number.isFinite) ? sum(values) : 'Unknown';
  const girSummary = (values) => values.every((value) => typeof value === 'boolean')
    ? `${values.filter(Boolean).length}/${values.length}`
    : 'Unknown';
  const directionLabels = {
    hit: 'Hit', left: 'Left', right: 'Right', short: 'Short', long: 'Long', missed: 'Missed', unknown: 'Unknown',
  };
  const unknown = (value) => value == null ? 'Unknown' : value;
  const rows = [
    {
      label: 'Par',
      values: round.holes.map((hole) => hole.par),
      out: sum(round.holes.slice(0, 9).map((hole) => hole.par)),
      in: sum(round.holes.slice(9).map((hole) => hole.par)),
      total: sum(round.holes.map((hole) => hole.par)),
    },
    {
      label: 'Gross',
      values: round.holes.map((hole) => hole.strokes),
      out: frontScore,
      in: backScore,
      total: round.score,
    },
    {
      label: 'Putts',
      values: round.holes.map((hole) => hole.putts),
      out: frontPutts,
      in: backPutts,
      total: round.putts,
    },
    {
      label: 'Yards',
      values: round.holes.map((hole) => unknown(hole.yards)),
      out: numericSummary(round.holes.slice(0, 9).map((hole) => hole.yards)),
      in: numericSummary(round.holes.slice(9).map((hole) => hole.yards)),
      total: numericSummary(round.holes.map((hole) => hole.yards)),
    },
    {
      label: 'Stroke index',
      values: round.holes.map((hole) => unknown(hole.strokeIndex)),
      out: '—',
      in: '—',
      total: '—',
    },
    {
      label: 'Adjusted',
      values: round.holes.map((hole) => unknown(hole.adjustedStrokes)),
      out: numericSummary(round.holes.slice(0, 9).map((hole) => hole.adjustedStrokes)),
      in: numericSummary(round.holes.slice(9).map((hole) => hole.adjustedStrokes)),
      total: numericSummary(round.holes.map((hole) => hole.adjustedStrokes)),
    },
    {
      label: 'Tee direction',
      values: round.holes.map((hole) => hole.teeAccuracy == null ? 'Unknown' : directionLabels[hole.teeAccuracy]),
      out: '—',
      in: '—',
      total: '—',
    },
    {
      label: 'GIR',
      values: round.holes.map((hole) => hole.gir === true ? 'Yes' : hole.gir === false ? 'No' : 'Unknown'),
      out: girSummary(round.holes.slice(0, 9).map((hole) => hole.gir)),
      in: girSummary(round.holes.slice(9).map((hole) => hole.gir)),
      total: girSummary(round.holes.map((hole) => hole.gir)),
    },
    {
      label: 'Events',
      values: round.holes.map((hole) => hole.penaltyCodes == null ? 'Unknown' : hole.penaltyCodes === '' ? 'None' : hole.penaltyCodes),
      out: '—',
      in: '—',
      total: '—',
    },
  ];
  return `
    <div class="panel panel--flush" id="selected-scorecard" tabindex="-1" role="region" aria-label="Selected round scorecard">
      <div class="scorecard-summary">
        <div>
          <h3>${escapeHtml(round.course)} · ${escapeHtml(formatDate(round.date))}</h3>
          <p>${escapeHtml(round.tee)} tee · gross scorecard and recorded supplemental fields</p>
        </div>
        <div class="scorecard-summary__totals">
          <span>Front<strong>${frontScore}</strong></span>
          <span>Back<strong>${backScore}</strong></span>
          <span>Gross<strong>${round.score}</strong></span>
          ${round.adjustedGross != null ? `<span>Adjusted<strong>${escapeHtml(round.adjustedGross)}</strong></span>` : ''}
        </div>
      </div>
      <div class="table-wrap" style="border:0;border-radius:0">
        <table class="scorecard-table">
          <thead><tr><th>Hole</th>${round.holes.map((hole) => `<th>${hole.number}</th>`).join('')}<th>Out</th><th>In</th><th>Total</th></tr></thead>
          <tbody>
            ${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}<td>${escapeHtml(row.out)}</td><td>${escapeHtml(row.in)}</td><td><strong>${escapeHtml(row.total)}</strong></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="note">Event codes: S = greenside sand, F = fairway sand, H = hazard/penalty area, O = out of bounds, and D = drop shot; repeated letters record repeated events. ${sourceLink(eventCodeGuide)}.</p>
      ${round.estimatedLostStrokes != null ? `<p class="note">The scorecard’s estimated lost strokes: ${escapeHtml(number(round.estimatedLostStrokes, 1))}. This may be fractional and is not a formal penalty-stroke count or an additive what-if. ${sourceLink(lostStrokesGuide)}</p>` : ''}
    </div>
  `;
}

function researchForCourse(courseName) {
  return allResearch().find((course) => course.name === courseName) || null;
}

function holeResearch(courseName, holeNumber) {
  const course = researchForCourse(courseName);
  return course?.holes?.find((hole) => Number(hole.number) === Number(holeNumber)) || null;
}

function researchDescription(entry) {
  if (!entry) return null;
  for (const key of ['description', 'officialDescription', 'summary', 'text', 'strategy', 'notes']) {
    if (typeof entry[key] === 'string' && entry[key].trim()) return entry[key].trim();
  }
  return null;
}

function firstCourseSource(courseName) {
  const course = researchForCourse(courseName);
  return Array.isArray(course?.sources) ? course.sources.find((source) => safeUrl(typeof source === 'string' ? source : source?.url)) : null;
}

function repeatHoleTable(report) {
  const eligible = report.repeatedHoles.filter((hole) => hole.rounds >= 2);
  if (!eligible.length) return emptyState('No repeat-hole sample qualifies', 'At least two detailed rounds are required for the same course, tee, and hole number.');
  const strongest = [...eligible].sort((a, b) => a.averageOverPar - b.averageOverPar || b.rounds - a.rounds).slice(0, 5);
  const hardest = [...eligible].sort((a, b) => b.averageOverPar - a.averageOverPar || b.rounds - a.rounds).slice(0, 5);
  const rows = (items, label) => items.map((hole) => {
    const evidence = holeResearch(hole.course, hole.number);
    const source = firstCourseSource(hole.course);
    const description = researchDescription(evidence);
    return `
      <tr>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td>${escapeHtml(hole.course)}</td>
        <td>${escapeHtml(hole.tee)}</td>
        <td>${hole.number}</td>
        <td>Par ${hole.par}</td>
        <td>${hole.rounds}</td>
        <td>${formatOverPar(hole.averageOverPar)}</td>
        <td>${description ? `${escapeHtml(description)}${source ? ` · ${sourceLink(source)}` : ''}` : 'No official hole description in the research set.'}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Group</th><th>Course</th><th>Tee</th><th>Hole</th><th>Par</th><th>n</th><th>Mean vs par</th><th>Official context</th></tr></thead>
        <tbody>${rows(strongest, 'Strongest')}${rows(hardest, 'Hardest')}</tbody>
      </table>
    </div>
    <p class="note">Qualification: at least two playings of the exact course + tee + hole. “Strongest” and “hardest” rank only this small observed sample, not the underlying holes.</p>
  `;
}

function archiveTable(report) {
  const rounds = [...report.chronological].reverse();
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Course / tee</th><th>Gross</th><th>Putts</th><th>GIR</th><th>FIR</th><th>Score Value</th><th title="TheGrint estimate, not formal penalty strokes">Lost strokes (est.)</th><th>Detail</th></tr></thead>
        <tbody>
          ${rounds.map((round) => `
            <tr>
              <td>${escapeHtml(formatDate(round.date, 'short'))}</td>
              <td><strong>${escapeHtml(round.course)}</strong><br><span class="cell-muted">${escapeHtml(round.tee)}</span></td>
              <td>${round.score}${round.adjustedGross != null ? `<br><span class="cell-muted">Adj. ${escapeHtml(round.adjustedGross)}</span>` : ''}</td>
              <td>${round.putts}</td>
              <td>${round.gir === null ? '—' : percent(round.gir, 0)}</td>
              <td>${round.fir === null ? '—' : percent(round.fir, 0)}</td>
              <td>${round.scoreValue === null ? '—' : number(round.scoreValue, 1)}</td>
              <td>${round.estimatedLostStrokes == null ? '—' : number(round.estimatedLostStrokes, 1)}</td>
              <td>${round.holes ? `<button class="row-action" type="button" data-round-key="${escapeHtml(roundKey(round))}">View 18</button>` : '<span class="cell-muted">Summary only</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderHoles(report) {
  const parCards = report.allHoles.length
    ? `<div class="par-grid">${report.parTypes.map((item) => `
        <article class="par-card">
          <span class="par-card__label">Par ${item.par}</span>
          <strong>${formatOverPar(item.averageOverPar)}</strong>
          <small>mean over par / hole<br>${percent(item.triplePlusRate, 1)} triple+ · n=${item.count}</small>
        </article>
      `).join('')}</div>`
    : emptyState('No par-type sample', 'Par 3 / 4 / 5 analysis requires detailed scorecards.');

  setHtml(dom.holes, `
    ${parCards}
    <div class="subsection">
      ${heatmapHtml(report)}
    </div>
    <div class="subsection">
      ${selectedRoundHtml(report)}
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <div><h3>Strongest and hardest repeat holes</h3><p>Course and tee remain part of every hole identity.</p></div>
      </div>
      ${repeatHoleTable(report)}
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <div><h3>Round archive</h3><p>${plural(report.summary.count, 'round')} in the active filter · “Score Value” preserves the source label and is not a handicap differential.</p></div>
      </div>
      ${archiveTable(report)}
    </div>
  `);
}

function puttingDistribution(report) {
  const entries = [
    ['0 putts', report.holeStats.putting.zero],
    ['1 putt', report.holeStats.putting.one],
    ['2 putts', report.holeStats.putting.two],
    ['3 putts', report.holeStats.putting.three],
    ['4+ putts', report.holeStats.putting.fourPlus],
  ];
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return `
    <div class="putt-distribution" role="img" aria-label="Distribution of putts per hole">
      ${entries.map(([label, count]) => `
        <div class="putt-bar">
          <span class="putt-bar__value">${count}<br>${percent(count / report.holeStats.count * 100, 0)}</span>
          <span class="putt-bar__fill" style="height:${count / max * 180}px"></span>
          <span class="putt-bar__label">${label}</span>
        </div>
      `).join('')}
    </div>
    <table class="sr-only">
      <caption>Distribution of putts per hole</caption>
      <thead><tr><th>Putts</th><th>Count</th><th>Rate</th></tr></thead>
      <tbody>${entries.map(([label, count]) => `<tr><td>${label}</td><td>${count}</td><td>${percent(count / report.holeStats.count * 100, 1)}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function perRoundThreePuttSvg(report) {
  const rows = report.detailed.map((round) => ({
    ...round,
    threePlus: round.holes.filter((hole) => hole.putts >= 3).length,
  }));
  if (!rows.length) return '';
  const width = 760;
  const rowHeight = 31;
  const height = 38 + rows.length * rowHeight;
  const left = 158;
  const right = 34;
  const max = Math.max(...rows.map((row) => row.threePlus), 1);
  const barWidth = width - left - right;
  return `
    <div class="chart-scroll" tabindex="0" role="region" aria-label="Scrollable three-plus-putt chart">
    <svg class="chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Three-plus-putt holes by detailed round">
      <title>Three-plus-putt holes by detailed round</title>
      ${rows.map((row, index) => {
        const y = 18 + index * rowHeight;
        const w = row.threePlus / max * barWidth;
        return `
          <text x="${left - 10}" y="${y + 13}" text-anchor="end">${escapeHtml(formatDate(row.date, 'short'))}</text>
          <rect class="${row.threePlus >= 3 ? 'bar--coral' : 'bar'}" x="${left}" y="${y}" width="${w}" height="18" rx="4">
            <title>${escapeHtml(`${formatDate(row.date)} at ${row.course}: ${row.threePlus} holes with three or more putts`)}</title>
          </rect>
          <text x="${left + w + 7}" y="${y + 13}">${row.threePlus}</text>
        `;
      }).join('')}
    </svg>
    </div>
    <table class="sr-only">
      <caption>Three-plus-putt holes by detailed round</caption>
      <thead><tr><th>Date</th><th>Course</th><th>Three-plus-putt holes</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.course)}</td><td>${row.threePlus}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function girPuttScatter(report) {
  const rows = report.chronological.filter((round) => round.gir !== null);
  if (!rows.length) return emptyState('No GIR comparison available', 'The selected rounds do not include reported GIR percentages.');
  const width = 520;
  const height = 330;
  const margin = { top: 26, right: 24, bottom: 48, left: 50 };
  const xs = rows.map((round) => round.gir);
  const ys = rows.map((round) => round.putts);
  const xMin = Math.min(0, Math.floor(Math.min(...xs) / 10) * 10);
  const xMax = Math.max(30, Math.ceil(Math.max(...xs) / 10) * 10);
  const yMin = Math.floor(Math.min(...ys) - 2);
  const yMax = Math.ceil(Math.max(...ys) + 2);
  const x = (value) => margin.left + (value - xMin) / (xMax - xMin || 1) * (width - margin.left - margin.right);
  const y = (value) => margin.top + (yMax - value) / (yMax - yMin || 1) * (height - margin.top - margin.bottom);
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  return `
    <div class="chart-scroll" tabindex="0" role="region" aria-label="Scrollable GIR and putting comparison chart">
    <svg class="chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Total putts compared with reported GIR percentage">
      <title>Total putts compared with reported GIR percentage</title>
      ${yTicks.map((tick) => `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${margin.left - 9}" y="${y(tick) + 4}" text-anchor="end">${whole(tick)}</text>`).join('')}
      ${xTicks.map((tick) => `<text x="${x(tick)}" y="${height - 20}" text-anchor="middle">${whole(tick)}%</text>`).join('')}
      <text x="${width / 2}" y="${height - 3}" text-anchor="middle">Reported GIR</text>
      ${rows.map((round) => `
        <circle class="scatter-dot" cx="${x(round.gir)}" cy="${y(round.putts)}" r="6">
          <title>${escapeHtml(`${formatDate(round.date)} at ${round.course}: ${round.gir}% GIR, ${round.putts} putts`)}</title>
        </circle>
      `).join('')}
    </svg>
    </div>
    <table class="sr-only">
      <caption>Total putts compared with reported GIR percentage</caption>
      <thead><tr><th>Date</th><th>Course</th><th>GIR</th><th>Putts</th></tr></thead>
      <tbody>${rows.map((round) => `<tr><td>${escapeHtml(round.date)}</td><td>${escapeHtml(round.course)}</td><td>${round.gir}%</td><td>${round.putts}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function renderPutting(report) {
  if (!report.allHoles.length) {
    setHtml(dom.putting, `
      ${emptyState('No hole-level putting data', 'Total putts remain visible in the overview, trend, and archive, but distribution and three-plus-putt rates require detailed scorecards.')}
      <div class="subsection panel"><div class="panel__head"><div><h3>Total putts and GIR</h3><p>${report.summary.girCount} of ${report.summary.count} selected rounds report GIR.</p></div></div>${girPuttScatter(report)}<p class="note">Total putts are partly shaped by GIR and first-putt distance. No first-putt distance is recorded, so this is not formal strokes-gained analysis.</p></div>
    `);
    return;
  }
  setHtml(dom.putting, `
    <div class="panel-grid">
      <article class="panel">
        <div class="panel__head"><div><h3>Putts per hole</h3><p>${report.holeStats.count} holes / ${report.summary.detailed} detailed rounds</p></div></div>
        ${puttingDistribution(report)}
      </article>
      <article class="panel">
        <div class="panel__head"><div><h3>Three-plus putting</h3><p>Observed hole frequency</p></div></div>
        <div class="callout-metric">
          <span>3+ putt rate</span>
          <strong>${percent(report.holeStats.threePlusRate, 1)}</strong>
          <p>${report.holeStats.threePlusCount} of ${report.holeStats.count} recorded holes.</p>
        </div>
        <div class="callout-metric" style="margin-top:10px;background:#dfeee8;color:#092b24">
          <span>Putts above two</span>
          <strong>${report.holeStats.excessPutts}</strong>
          <p>A descriptive what-if total across detailed holes—not guaranteed strokes saved.</p>
        </div>
      </article>
    </div>
    <div class="panel-grid panel-grid--equal" style="margin-top:14px">
      <article class="panel">
        <div class="panel__head"><div><h3>Three-plus-putt holes by round</h3><p>Detailed scorecards only</p></div></div>
        ${perRoundThreePuttSvg(report)}
      </article>
      <article class="panel">
        <div class="panel__head"><div><h3>Total putts and GIR</h3><p>${report.summary.girCount} of ${report.summary.count} selected rounds report GIR</p></div></div>
        ${girPuttScatter(report)}
      </article>
    </div>
    <p class="note">Total putts depend on how often a green is reached and the unrecorded first-putt distance. The charts are descriptive, part-whole context—not causal evidence and not formal strokes gained.</p>
  `);
}

function shapeIcon(shape) {
  const path = shape === 'dogleg-left'
    ? 'M55 12c1 34-7 50-30 72'
    : shape === 'dogleg-right'
      ? 'M25 12c-1 34 7 50 30 72'
      : 'M40 12v72';
  return `<svg viewBox="0 0 80 96" width="48" height="58" aria-hidden="true"><path d="${path}" fill="none" stroke="#77c7ac" stroke-width="8" stroke-linecap="round"/><circle cx="${shape === 'dogleg-left' ? 25 : shape === 'dogleg-right' ? 55 : 40}" cy="84" r="7" fill="#d8eee5"/></svg>`;
}

function directionChart(report) {
  const observed = report.directions.filter((item) => item.count > 0);
  if (!observed.length) return emptyState('No observed tee-direction data', 'No detailed hole in this filter contains a tee-accuracy direction code.');
  const max = Math.max(...observed.map((item) => item.count), 1);
  const width = 650;
  const height = 55 + observed.length * 36;
  return `
    <div class="chart-scroll" tabindex="0" role="region" aria-label="Scrollable tee-direction chart">
    <svg class="chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed tee-accuracy direction codes">
      <title>Observed tee-accuracy direction codes</title>
      ${observed.map((item, index) => {
        const y = 20 + index * 36;
        const w = item.count / max * 430;
        return `
          <text x="90" y="${y + 15}" text-anchor="end" fill="#bfd0c9">${escapeHtml(item.direction)}</text>
          <rect x="105" y="${y}" width="${w}" height="20" rx="4" fill="#4ea99a"><title>${escapeHtml(`${item.direction}: ${item.count} observed holes`)}</title></rect>
          <text x="${112 + w}" y="${y + 15}" fill="#e8f2ee">${item.count}</text>
        `;
      }).join('')}
    </svg>
    </div>
    <table class="sr-only"><caption>Observed tee-accuracy direction codes</caption><thead><tr><th>Code</th><th>Count</th></tr></thead><tbody>${observed.map((item) => `<tr><td>${escapeHtml(item.direction)}</td><td>${item.count}</td></tr>`).join('')}</tbody></table>
  `;
}

function researchOverview(course) {
  return course?.overview || researchDescription(course) || 'No official overview text is included in the current research set.';
}

function researchFeatures(course) {
  const raw = course?.features;
  if (!Array.isArray(raw)) return [];
  return raw.map((feature) => {
    if (typeof feature === 'string') return feature;
    return feature?.description || feature?.text || feature?.name || feature?.title;
  }).filter(Boolean);
}

function shapeGroupCards(report) {
  const groups = courseHoleGroups(report, { courses: allResearch() });
  if (!groups.length) return emptyState('Insufficient documented shape evidence', 'No played holes in this filter have an explicitly documented straight, dogleg-left, or dogleg-right shape in the research set.');
  const labels = {
    straight: 'Straight',
    'dogleg-left': 'Dogleg left',
    'dogleg-right': 'Dogleg right',
  };
  return `
    <div class="shape-grid">
      ${groups.map((group) => `
        <article class="shape-card">
          ${shapeIcon(group.shape)}
          <span class="shape-card__label">${escapeHtml(labels[group.shape] || group.shape)}</span>
          <strong>${formatOverPar(group.averageOverPar)}</strong>
          <small>mean over par / playing<br>n=${group.count} · ${plural(group.uniqueHoles, 'unique hole')} · ${plural(group.courses, 'course')}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function lengthBandCards(report) {
  const available = report.lengthBands.filter((band) => band.count > 0);
  if (!available.length) return emptyState('No verified par-4 yardages', 'Length bands require recorded yardages in detailed scorecards; missing yards are excluded.');
  return `
    <div class="band-grid">
      ${available.map((band) => `
        <article class="band-card">
          <span class="band-card__label">${escapeHtml(band.label)}</span>
          <strong>${formatOverPar(band.averageOverPar)}</strong>
          <small>mean over par / playing<br>n=${band.count} · ${plural(band.courses, 'course')}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function holeFactCard() {
  const courses = allResearch();
  if (!courses.length) return emptyState('No course research in this dataset', 'Official layout context will appear when the published research payload includes course entries.');
  const courseNames = courses.map((course) => course.name).filter(Boolean).sort();
  if (!courseNames.includes(state.dnaCourse)) state.dnaCourse = state.course !== 'all' && courseNames.includes(state.course) ? state.course : courseNames[0];
  const course = researchForCourse(state.dnaCourse);
  const holes = Array.isArray(course?.holes) ? [...course.holes].sort((a, b) => Number(a.number) - Number(b.number)) : [];
  const holeNumbers = holes.map((hole) => Number(hole.number)).filter(Number.isFinite);
  if (!holeNumbers.includes(Number(state.dnaHole))) state.dnaHole = holeNumbers[0] || 1;
  const hole = holes.find((entry) => Number(entry.number) === Number(state.dnaHole));
  const description = researchDescription(hole);
  const sources = Array.isArray(course?.sources) ? course.sources.filter((source) => safeUrl(typeof source === 'string' ? source : source?.url)) : [];
  return `
    <div class="dna-controls">
      <label>
        <span class="sr-only">Course facts course</span>
        <select data-control="dna-course">${renderSelectOptions(courseNames, state.dnaCourse)}</select>
      </label>
      <label>
        <span class="sr-only">Course facts hole</span>
        <select data-control="dna-hole">
          ${holeNumbers.length
            ? holeNumbers.map((numberValue) => `<option value="${numberValue}"${Number(state.dnaHole) === numberValue ? ' selected' : ''}>Hole ${numberValue}</option>`).join('')
            : '<option value="1">No hole entries</option>'}
        </select>
      </label>
    </div>
    <div class="hole-fact">
      <span class="hole-fact__number">${hole ? `Official hole context · ${escapeHtml(hole.confidence || 'source supplied')}` : 'Official hole context'}</span>
      <h4>${escapeHtml(state.dnaCourse)} · Hole ${escapeHtml(state.dnaHole)}</h4>
      <p>${escapeHtml(description || 'No official description is available for this course and hole in the current research set.')}</p>
      ${safeUrl(hole?.sourceUrl) ? `<p class="hole-source">${sourceLink({ url: hole.sourceUrl, title: `Official hole ${state.dnaHole} description` })}</p>` : ''}
      ${sources.length ? `<ul class="source-list">${sources.map((source) => `<li>${sourceLink(source)}</li>`).join('')}</ul>` : '<p style="margin-top:12px">No validated HTTP(S) source is attached to this course entry.</p>'}
    </div>
  `;
}

function courseResearchCards() {
  const courses = allResearch();
  if (!courses.length) return '';
  return `
    <div class="course-card-grid">
      ${courses.map((course) => {
        const features = researchFeatures(course);
        const sources = Array.isArray(course.sources) ? course.sources.filter((source) => safeUrl(typeof source === 'string' ? source : source?.url)) : [];
        return `
          <article class="course-fact-card">
            <h4>${escapeHtml(course.name || 'Unnamed course')}</h4>
            <p>${escapeHtml(researchOverview(course))}</p>
            ${features.length ? `<ul>${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>` : ''}
            ${sources.length ? `<ul class="source-list">${sources.map((source) => `<li>${sourceLink(source)}</li>`).join('')}</ul>` : ''}
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderDna(report) {
  setHtml(dom.dna, `
    <div class="panel-grid">
      <article class="dark-panel">
        <div class="panel__head">
          <div><h3>Documented hole shapes</h3><p>Explicit source descriptions matched to played holes</p></div>
        </div>
        ${shapeGroupCards(report)}
        <p class="note">Exploratory only. Shape groups mix par, length, course, weather, and repeated play. They cannot identify a swing mechanism or establish a causal shape preference.</p>
      </article>
      <article class="dark-panel">
        <div class="panel__head">
          <div><h3>Official hole lookup</h3><p>Unknown is shown explicitly; geometry is never invented.</p></div>
        </div>
        ${holeFactCard()}
      </article>
    </div>
    <div class="panel-grid panel-grid--equal" style="margin-top:14px">
      <article class="dark-panel">
        <div class="panel__head"><div><h3>Played par-4 length bands</h3><p>Verified yardages only</p></div></div>
        ${lengthBandCards(report)}
        <p class="note">These bands describe this played sample. They do not establish a universal relationship between length and scoring.</p>
      </article>
      <article class="dark-panel">
        <div class="panel__head"><div><h3>Tee-accuracy directions</h3><p>${report.directionCoverage.holes} observed holes across ${plural(report.directionCoverage.rounds, 'round')}</p></div></div>
        ${directionChart(report)}
        <p class="note">Coverage is limited to explicitly observed codes. “Left” or “right” records a result direction—not ball curvature, face/path, or root cause.</p>
      </article>
    </div>
    ${allResearch().length ? `
      <div class="subsection">
        <div class="subsection__head"><div><h3 style="color:#fff">Course research notes</h3><p style="color:#acc4ba">Official-source context supplied with the report.</p></div></div>
        ${courseResearchCards()}
      </div>
    ` : ''}
  `);
}

function renderPriorities(report) {
  const detailedRounds = report.summary.detailed;
  const capDouble = report.holeStats.aboveDouble;
  const twoPutt = report.holeStats.excessPutts;
  const tripleCount = report.holeStats.distribution.triplePlus;
  const holeCount = report.holeStats.count;
  const recordedEventCodes = report.allHoles.filter((hole) => hole.penaltyCodes != null && hole.penaltyCodes !== '');
  const detailMessage = holeCount
    ? `${tripleCount} triple-or-worse holes and ${report.holeStats.threePlusCount} three-plus-putt holes appear across ${holeCount} recorded holes.`
    : 'There are no detailed holes in the active filter, so no hole-level scenarios can be calculated.';
  setHtml(dom.priorities, `
    <div class="scenario-grid">
      <article class="scenario-card">
        <span class="scenario-card__label">Independent what-if · cap at double bogey</span>
        <strong>${holeCount ? `−${capDouble}` : '—'}</strong>
        <p>${holeCount ? `${capDouble} strokes sit above double bogey across ${plural(detailedRounds, 'detailed round')}. This mathematical cap is not a forecast.` : 'Requires detailed scorecards.'}</p>
      </article>
      <article class="scenario-card">
        <span class="scenario-card__label">Independent what-if · maximum two putts</span>
        <strong>${holeCount ? `−${twoPutt}` : '—'}</strong>
        <p>${holeCount ? `${twoPutt} putts were recorded above two per hole. This is descriptive and does not imply every one was preventable.` : 'Requires detailed scorecards.'}</p>
      </article>
    </div>
    <p class="note">${escapeHtml(detailMessage)} The two scenarios overlap within gross score and are not additive.</p>
    <div class="experiment-grid">
      <article class="experiment-card">
        <span class="experiment-card__number">01</span>
        <h3>Record first-putt distance</h3>
        <p>Add an estimated starting distance for every putt. That separates three-putt frequency from the approach positions that created it.</p>
      </article>
      <article class="experiment-card">
        <span class="experiment-card__number">02</span>
        <h3>${recordedEventCodes.length ? 'Review recorded events' : 'Label penalty type'}</h3>
        <p>${recordedEventCodes.length
          ? `${recordedEventCodes.length} holes already have recorded event codes. Review those entries alongside the scorecard before adding more context; event labels alone do not establish a rule penalty count or cause.`
          : 'Record scorecard event codes when available. A typed record can add context to triple-or-worse holes without treating labels as causes or formal penalty counts.'}</p>
      </article>
      <article class="experiment-card">
        <span class="experiment-card__number">03</span>
        <h3>Capture aim and club</h3>
        <p>For tee shots, note intended target and club alongside outcome direction. That tests strategy without misreading a miss direction as curvature.</p>
      </article>
    </div>
  `);
}

function allSourceLinks() {
  const seen = new Set();
  const rows = [];
  for (const course of allResearch()) {
    for (const source of Array.isArray(course.sources) ? course.sources : []) {
      const raw = typeof source === 'string' ? source : source?.url;
      const url = safeUrl(raw);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      rows.push({ course: course.name, source });
    }
  }
  return rows;
}

function fieldCoverage(report) {
  const expectedHoleCells = report.summary.count * 18;
  const detailedHoles = report.chronological.flatMap((round) => round.holes || []);
  const observed = (predicate) => detailedHoles.filter(predicate).length;
  const holeRows = [
    ['Gross score', observed((hole) => Number.isFinite(hole.strokes))],
    ['Par', observed((hole) => Number.isFinite(hole.par))],
    ['Putts', observed((hole) => Number.isFinite(hole.putts))],
    ['Yards', observed((hole) => Number.isFinite(hole.yards))],
    ['Stroke index', observed((hole) => Number.isFinite(hole.strokeIndex))],
    ['Hole GIR', observed((hole) => typeof hole.gir === 'boolean')],
    ['Tee direction', observed((hole) => hole.teeAccuracy != null)],
    ['Adjusted strokes', observed((hole) => Number.isFinite(hole.adjustedStrokes))],
    ['Event codes', observed((hole) => hole.penaltyCodes != null)],
  ];
  const roundRows = [
    ['Adjusted gross total', report.chronological.filter((round) => round.adjustedGross != null).length],
    ['Site lost-strokes estimate', report.chronological.filter((round) => round.estimatedLostStrokes != null).length],
  ];
  const row = (label, count, expected, kind) => `
    <tr>
      <th scope="row">${escapeHtml(label)}</th>
      <td>${count} / ${expected}</td>
      <td>${percent(count / expected * 100, 0)}</td>
      <td>${escapeHtml(kind)}</td>
    </tr>
  `;
  return `
    <p>Per-hole coverage counts observed cells against ${expectedHoleCells} expected cells (${report.summary.count} selected rounds × 18), including summary-only rounds. Explicit <em>No</em>, zero, and blank event records count as observed.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Field</th><th>Observed</th><th>Coverage</th><th>Denominator</th></tr></thead>
        <tbody>
          ${holeRows.map(([label, count]) => row(label, count, expectedHoleCells, 'Hole cells')).join('')}
          ${roundRows.map(([label, count]) => row(label, count, report.summary.count, 'Rounds')).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderMethod(report) {
  const sources = allSourceLinks();
  setHtml(dom.method, `
    <details open>
      <summary>How the numbers are defined</summary>
      <div class="details-body">
        <p><strong>Scoring:</strong> every performance calculation uses gross score. Adjusted gross and per-hole adjusted strokes are displayed separately when supplied. “Score Value” preserves the source label and is not presented as a handicap differential.</p>
        <p><strong>Missing values:</strong> absent hole grids, GIR, FIR, yardage, stroke index, direction, adjusted strokes, event codes, and research descriptions are excluded from their respective calculations—not converted to zero. Every chart names its relevant denominator.</p>
        <p><strong>Rates:</strong> three-plus-putt and triple-plus rates use recorded holes. Mean GIR and FIR give equal weight to each available round-level percentage. These remain averages of rounded round rates, not pooled hole-level rates, even when per-hole records are available.</p>
        <p><strong>Events and estimates:</strong> scorecard event codes include sand as well as hazard, out-of-bounds, and drop records; they are not formal rule penalty-stroke counts. The site’s lost-strokes total is its estimate, may be fractional, and is not added to any score or what-if. ${sourceLink(eventCodeGuide)} · ${sourceLink(lostStrokesGuide)}</p>
        <p><strong>Comparisons:</strong> season thirds are equal-sized chronological groups. Repeat holes require the same course, tee, and hole number with at least two playings. No population percentile is shown; the samples are too small for a stable rank.</p>
      </div>
    </details>
    <details>
      <summary>Coverage, dates, and interpretation</summary>
      <div class="details-body">
        <p>The active dataset runs from ${escapeHtml(formatDate(report.summary.startDate))} through ${escapeHtml(formatDate(report.summary.endDate))}. It contains ${report.summary.count} selected rounds, including ${report.summary.detailed} complete gross-score and putt grids. Supplementary fields have field-level coverage below.</p>
        ${fieldCoverage(report)}
        <p>Course and tee mixes are observational. Putting totals lack first-putt distance; direction codes do not describe curvature; layout groups mix geometry with par, distance, conditions, and golfer decisions.</p>
        <p>Generated ${escapeHtml(state.payload.generatedAt ? new Date(state.payload.generatedAt).toLocaleString('en-US') : 'at an unspecified time')}.</p>
      </div>
    </details>
    <details>
      <summary>Official course sources (${sources.length})</summary>
      <div class="details-body">
        ${sources.length
          ? `<ul>${sources.map(({ course, source }) => `<li>${escapeHtml(course)} — ${sourceLink(source)}</li>`).join('')}</ul>`
          : '<p>No official HTTP(S) course sources are included in the current research payload.</p>'}
      </div>
    </details>
    <div class="download-row">
      <div>
        <strong>Download the published dataset</strong>
        <span>Sanitized performance fields and official research citations; no account identity or analytics tracking.</span>
      </div>
      <a href="./data.json" download>Download JSON</a>
    </div>
  `);
}

function renderAll() {
  const report = currentAnalysis();
  if (!report) {
    dom.report.hidden = true;
    dom.status.hidden = false;
    setHtml(dom.status, emptyState('No rounds match this filter', 'Reset the course lens to return to the complete report.'));
    return;
  }
  renderHero(analyze(state.payload.rounds));
  renderCourseFilter();
  renderOverview(report);
  renderTrend(report);
  renderRhythm(report);
  renderHoles(report);
  renderPutting(report);
  renderDna(report);
  renderPriorities(report);
  renderMethod(report);
  dom.status.hidden = true;
  dom.report.hidden = false;
}

function assertPayload(payload) {
  if (!payload || payload.schemaVersion !== 1) throw new Error('The data file uses an unsupported schema version.');
  if (!Array.isArray(payload.rounds) || payload.rounds.length === 0) throw new Error('The data file contains no rounds.');
  analyze(payload.rounds);
}

function bindEvents() {
  dom.courseFilter.addEventListener('change', () => {
    state.course = dom.courseFilter.value;
    state.heatmapCourse = null;
    state.selectedRoundKey = null;
    if (state.course !== 'all') state.dnaCourse = state.course;
    renderAll();
  });

  dom.resetFilter.addEventListener('click', () => {
    state.course = 'all';
    state.heatmapCourse = null;
    state.selectedRoundKey = null;
    renderAll();
  });

  dom.report.addEventListener('click', (event) => {
    const metricButton = event.target.closest('[data-trend-metric]');
    if (metricButton) {
      state.trendMetric = metricButton.dataset.trendMetric;
      renderTrend(currentAnalysis());
      [...dom.trend.querySelectorAll('[data-trend-metric]')].find((button) => button.dataset.trendMetric === state.trendMetric)?.focus({ preventScroll: true });
      return;
    }
    const roundButton = event.target.closest('[data-round-key]');
    if (roundButton) {
      state.selectedRoundKey = roundButton.dataset.roundKey;
      renderHoles(currentAnalysis());
      requestAnimationFrame(() => {
        const scorecard = document.querySelector('#selected-scorecard');
        scorecard?.focus({ preventScroll: true });
        scorecard?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    }
  });

  dom.report.addEventListener('change', (event) => {
    const control = event.target.dataset.control;
    if (control === 'heatmap-course') {
      state.heatmapCourse = event.target.value;
      const report = currentAnalysis();
      const initial = report.detailed.find((round) => round.course === state.heatmapCourse);
      state.selectedRoundKey = initial ? roundKey(initial) : null;
      renderHoles(report);
      dom.holes.querySelector('[data-control="heatmap-course"]')?.focus({ preventScroll: true });
    }
    if (control === 'dna-course') {
      state.dnaCourse = event.target.value;
      state.dnaHole = 1;
      renderDna(currentAnalysis());
      dom.dna.querySelector('[data-control="dna-course"]')?.focus({ preventScroll: true });
    }
    if (control === 'dna-hole') {
      state.dnaHole = Number(event.target.value);
      renderDna(currentAnalysis());
      dom.dna.querySelector('[data-control="dna-hole"]')?.focus({ preventScroll: true });
    }
  });
}

async function initialize() {
  bindEvents();
  try {
    const response = await fetch('./data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`The data request returned ${response.status}.`);
    const payload = await response.json();
    assertPayload(payload);
    state.payload = {
      ...payload,
      research: payload.research && Array.isArray(payload.research.courses)
        ? payload.research
        : { courses: [] },
    };
    renderAll();
  } catch (error) {
    console.error(error);
    dom.report.hidden = true;
    dom.status.hidden = false;
    setHtml(dom.status, `
      <div class="error-card">
        <h2>The report data could not be loaded</h2>
        <p>${escapeHtml(error instanceof Error ? error.message : 'An unknown data error occurred.')} Confirm that <code>data.json</code> is published beside this page, then reload.</p>
      </div>
    `);
    setHtml(dom.heroMeta, '<span class="coverage-badge">Data unavailable</span>');
  }
}

initialize();
