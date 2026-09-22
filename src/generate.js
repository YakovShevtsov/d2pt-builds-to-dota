// Renders a Dota 2 guide file (.build, GuideFormatVersion 2) from an extracted D2PT build.
const { t } = require('./i18n');

const DEFAULTS = {
  earlyMaxMin: 13,         // build items bought before this minute -> early game
  coreMaxMin: 33,          // ... before this -> core, after -> late
  situationalMax: 8,
  talentMinPickRate: 0.15, // a talent is chosen by winrate only with enough data
  talentMinMatches: 100,
};

const pct = x => Math.round(x * 100) + '%';
const q = s => String(s).replace(/"/g, "'");
const hex = n => '0x' + n.toString(16).toUpperCase().padStart(16, '0');

function timingLabel(items, stats) {
  const mins = items.map(i => stats[i]?.min).filter(m => m != null).map(Math.round);
  if (!mins.length) return '';
  const lo = Math.min(...mins), hi = Math.max(...mins), min = t('guide.min');
  return lo === hi ? ` (~${lo} ${min})` : ` (~${lo}–${hi} ${min})`;
}

function pickTalent(options, cfg) {
  const popular = [...options].sort((a, b) => b.pr - a.pr)[0];
  const trusted = options.filter(o => o.pr >= cfg.talentMinPickRate && o.n >= cfg.talentMinMatches);
  const best = trusted.sort((a, b) => b.wr - a.wr)[0] || popular;
  return { pick: best, other: options.find(o => o !== best), byWinrate: best !== popular };
}

function renderGuide(b, { ts, revision, accountId, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };
  const st = b.items;
  const minOf = i => st[i]?.min ?? 99;
  const early = b.build.filter(i => minOf(i) < cfg.earlyMaxMin);
  const core = b.build.filter(i => minOf(i) >= cfg.earlyMaxMin && minOf(i) < cfg.coreMaxMin);
  const late = b.build.filter(i => minOf(i) >= cfg.coreMaxMin);
  const sit = b.situational.filter(i => !b.build.includes(i))
    .sort((x, y) => minOf(x) - minOf(y)).slice(0, cfg.situationalMax);

  const L = (key, vars) => t('guide.' + key, vars);
  const sections = [
    [L('secStart'), b.start],
    [L('secEarly') + timingLabel(early, st), early],
    [L('secCore') + timingLabel(core, st), core],
    [L('secLate') + timingLabel(late, st), late],
    [L('secSituational') + timingLabel(sit, st), sit],
  ].filter(([, list]) => list.length);

  const itemTips = {};
  for (const i of [...b.build, ...sit]) {
    const s = st[i];
    if (s) itemTips[i] = L('itemTip', { min: Math.round(s.min ?? 0), pr: pct(s.pr ?? 0), wr: pct(s.wr ?? 0) });
  }

  const talents = b.talents.map(x => ({ lvl: x.lvl, ...pickTalent(x.options, cfg) }));
  const abilityTips = {};
  for (const { pick, other, byWinrate } of talents) {
    abilityTips[pick.name] = L('talentTip', {
      how: L(byWinrate ? 'talentByWinrate' : 'talentPopular'),
      pr: pct(pick.pr), wr: pct(pick.wr), n: pick.n,
      other: other.label, opr: pct(other.pr), owr: pct(other.wr), on: other.n,
    });
  }

  const posName = `Pos ${b.pos}`;
  const overview = L('overview', {
    pos: posName, patch: b.patch, matches: b.matches, wr: pct(b.wr),
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    talentPr: pct(cfg.talentMinPickRate), talentN: cfg.talentMinMatches,
  });

  const T = n => '\t'.repeat(n);
  const kv = (n, k, v) => `${T(n)}"${k}"\t\t"${q(v)}"\n`;
  let s = `"guidedata"\n{\n`;
  s += kv(1, 'Hero', b.hero) + kv(1, 'Title', `D2PT ${posName} (${b.patch})`) + kv(1, 'Role', b.pos >= 4 ? '#DOTA_HeroGuide_Role_Support' : '#DOTA_HeroGuide_Role_Core');
  s += kv(1, 'GameplayVersion', b.patch) + kv(1, 'Overview', overview) + kv(1, 'GuideRevision', revision);
  s += kv(1, 'AssociatedWorkshopItemID', hex(0)) + kv(1, 'OriginalCreatorID', hex(accountId)) + kv(1, 'GuideFormatVersion', 2);
  s += kv(1, 'TimeUpdated', hex(ts)) + kv(1, 'TimePublished', hex(0));
  s += `${T(1)}"ItemBuild"\n${T(1)}{\n${T(2)}"Items"\n${T(2)}{\n`;
  for (const [name, list] of sections) s += `${T(3)}"${name}"\n${T(3)}{\n` + list.map(i => kv(4, 'item', i)).join('') + `${T(3)}}\n`;
  s += `${T(2)}}\n${T(2)}"ItemTooltips"\n${T(2)}{\n` + Object.entries(itemTips).map(([k, v]) => kv(3, k, v)).join('') + `${T(2)}}\n${T(1)}}\n`;
  s += `${T(1)}"AbilityBuild"\n${T(1)}{\n${T(2)}"AbilityOrder"\n${T(2)}{\n`;
  s += b.abilities.map((a, i) => kv(3, i + 1, a)).join('');
  s += talents.map((t, i) => kv(3, 27 + i, t.pick.name)).join(''); // slots 27-30 = talent tiers 10/15/20/25
  s += `${T(2)}}\n${T(2)}"AbilityTooltips"\n${T(2)}{\n` + Object.entries(abilityTips).map(([k, v]) => kv(3, k, v)).join('') + `${T(2)}}\n${T(1)}}\n}\n`;
  return { text: s, talents };
}

module.exports = { renderGuide, DEFAULTS };
