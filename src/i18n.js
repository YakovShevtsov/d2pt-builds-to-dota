// Strings for everything produced outside the page: log lines and the guide text itself.
// t('a.b', {vars}) -> string; {var} placeholders are replaced.
const STRINGS = {
  guide: {
    secStart: 'Starting items',
    secEarly: 'Early game',
    secCore: 'Core items',
    secLate: 'Late game',
    secSituational: 'Situational',
    min: 'min',
    itemTip: '~{min} min · bought in {pr} · WR {wr}',
    talentByWinrate: 'Picked by win rate',
    talentPopular: 'Most popular',
    talentTip: '{how}: taken in {pr}, WR {wr} ({n} games). Alternative: {other} — {opr}, WR {owr} ({on} games)',
    overview: 'Build from dota2protracker.com ({pos}, 7000+ MMR, patch {patch}). Most popular build: {matches} matches, WR {wr}. ' +
      'Updated {date}. Item tooltips show the average timing, how often it is bought and its win rate. ' +
      'Talents are picked by win rate (when taken in ≥{talentPr} of games with ≥{talentN} games), otherwise the most popular one.',
  },
  log: {
    account: 'Account: {name}',
    dryRun: '   [dry run — nothing is written to Steam]',
    nothingToInstall: 'Nothing to install.',
    loading: 'Fetching {n} build(s) from D2PT...',
    heroNotFound: '  ✗ {label}: hero not found',
    noBuild: '  ✗ {label}: D2PT has no build for this role',
    failed: '  ✗ {label}: {reason}',
    source: 'Source: {transport}.',
    needSteamClosed: '! New guides ({list}) can only be added while Steam is closed — skipped.',
    newGuide: '+ new     ',
    updatedGuide: '↻ updated',
    guideLine: '  {mark} {hero} pos {pos}  ({patch}, {matches} games, WR {wr}, talents {talents})',
    dryRunPath: 'Dry run: files are in {dir}',
    done: 'Done: {n} guide(s){registered}. * — talent picked by win rate.',
    registered: ', {n} registered in Steam Cloud',
    startSteam: 'Start Steam, then Dota.',
    restartDota: 'Restart Dota to see the changes.',
    nothingToRemove: 'Nothing to remove.',
    removeNeedsSteamClosed: 'Guides can only be removed while Steam is closed.',
    removed: '  − removed {key}',
    removedTotal: 'Removed: {n}.',
    closingSteam: 'Closing Steam...',
    startingSteam: 'Starting Steam...',
    steamReady: 'Steam is running.',
    waitingSync: 'Waiting for Steam to upload the guides to the cloud...',
    syncDone: 'Guides are in the cloud.',
    syncSlow: '! Steam has not finished uploading yet — Dota may not show the newest guides.',
    launchingDota: 'Launching Dota...',
    dotaAlreadyRunning: 'Dota is already running — restart it to pick up new guides.',
    waitingCloudflare: 'Waiting for the site to let the browser through (Cloudflare check)...',
    usingBrowser: 'Using browser: {name}',
    curlFailed: 'curl {reason} — trying the browser instead',
    curlChallenged: 'curl did not pass the Cloudflare check — switching to the browser',
  },
  err: {
    noAccounts: 'No Steam account with Dota 2 found on this PC',
    accountNotFound: 'Account "{q}" not found. Available: {list}',
    heroNotFound: 'Hero "{name}" not found',
    badPositions: 'Invalid roles for {hero}: {positions}',
    noSteam: 'Steam not found',
    steamNotClosed: 'Steam did not close within 60 seconds',
    steamNotStarted: 'Steam did not start within 60 seconds',
    badCache: 'Unexpected remotecache.vdf format',
    limited: 'D2PT refused the request (403). Try again in a few minutes.',
    curlOnly: 'Cloudflare is blocking curl and the browser mode is off (--fetch curl)',
    browserChallenged: 'Cloudflare blocked the browser too. Try again later.',
    noBrowser: 'No Chromium-based browser found (Chrome, Edge, Yandex, Opera, Brave, Vivaldi)',
    noDebugPort: '{name} did not open its debugging port',
    challengeTimeout: 'The site did not let the browser through within 60 seconds. Try again later.',
    curlRequest: 'could not make the request: {why}',
    itemsFailed: 'Could not load the item list from OpenDota: {why}',
    http: 'D2PT {path}: HTTP {status}',
  },
  // curl exit codes, explained in plain language
  curl: {
    5: 'could not reach the proxy server',
    6: 'could not resolve dota2protracker.com (DNS problem or no internet)',
    7: 'could not connect to dota2protracker.com (ISP block, firewall or antivirus)',
    28: 'the server did not answer within 30 seconds',
    35: 'could not establish a secure connection (often antivirus, VPN or an ISP block)',
    60: 'could not verify the site certificate (often antivirus HTTPS scanning or a corporate proxy)',
  },
};

function t(key, vars = {}) {
  const str = key.split('.').reduce((o, k) => (o || {})[k], STRINGS);
  if (str == null) return key;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

module.exports = { t, STRINGS };
