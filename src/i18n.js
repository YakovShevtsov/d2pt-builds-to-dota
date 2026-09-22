// Strings for everything produced outside the page: log lines and the guide text itself.
// t(lang, 'a.b', {vars}) -> string; {var} placeholders are replaced.
const STRINGS = {
  ru: {
    guide: {
      secStart: 'Стартовые предметы',
      secEarly: 'Ранняя игра',
      secCore: 'Основные предметы',
      secLate: 'Поздняя игра',
      secSituational: 'Ситуативно',
      min: 'мин',
      itemTip: '~{min} мин · берут {pr} · WR {wr}',
      talentByWinrate: 'Выбран по винрейту',
      talentPopular: 'Самый популярный',
      talentTip: '{how}: берут {pr}, WR {wr} ({n} игр). Альтернатива: {other} — {opr}, WR {owr} ({on} игр)',
      overview: 'Сборка с dota2protracker.com ({pos}, 7000+ MMR, патч {patch}). Самый популярный билд: {matches} матчей, WR {wr}. ' +
        'Обновлено {date}. В подсказках предметов — средний тайминг, частота покупки и винрейт. ' +
        'Таланты выбраны по винрейту (если их берут ≥{talentPr} и ≥{talentN} игр), иначе самые популярные.',
    },
    log: {
      account: 'Аккаунт: {name}',
      dryRun: '   [пробный запуск — в Steam ничего не пишется]',
      nothingToInstall: 'Нечего устанавливать.',
      loading: 'Загружаю {n} билд(ов) с D2PT...',
      heroNotFound: '  ✗ {label}: герой не найден',
      noBuild: '  ✗ {label}: у D2PT нет билда для этой роли',
      failed: '  ✗ {label}: {reason}',
      source: 'Источник: {transport}.',
      needSteamClosed: '! Новые гайды ({list}) можно добавить только при закрытом Steam — пропущены.',
      newGuide: '+ новый   ',
      updatedGuide: '↻ обновлён',
      guideLine: '  {mark} {hero} pos {pos}  ({patch}, {matches} игр, WR {wr}, таланты {talents})',
      dryRunPath: 'Пробный запуск: файлы в {dir}',
      done: 'Готово: {n} гайд(ов){registered}. * — талант выбран по винрейту.',
      registered: ', {n} зарегистрировано в Steam Cloud',
      startSteam: 'Запусти Steam, затем Dota.',
      restartDota: 'Перезайди в Dota, чтобы увидеть изменения.',
      nothingToRemove: 'Нечего удалять.',
      removeNeedsSteamClosed: 'Удалять гайды можно только при закрытом Steam.',
      removed: '  − удалён {key}',
      removedTotal: 'Удалено: {n}.',
      closingSteam: 'Закрываю Steam...',
      waitingCloudflare: 'Жду, пока сайт пропустит браузер (проверка Cloudflare)...',
      usingBrowser: 'Использую браузер: {name}',
      curlFailed: 'curl {reason} — пробую через браузер',
      curlChallenged: 'curl не прошёл проверку Cloudflare — переключаюсь на браузер',
    },
    err: {
      noAccounts: 'На этом ПК нет аккаунтов Steam с Dota 2',
      accountNotFound: 'Аккаунт "{q}" не найден. Доступные: {list}',
      heroNotFound: 'Герой "{name}" не найден',
      badPositions: 'Неверные роли для {hero}: {positions}',
      noSteam: 'Не найден Steam',
      steamNotClosed: 'Steam не закрылся за 60 секунд',
      badCache: 'Неожиданный формат remotecache.vdf',
      limited: 'D2PT временно ограничил запросы (слишком часто). Попробуй через пару часов.',
      curlOnly: 'Cloudflare не пропускает curl, а браузерный режим выключен (--fetch curl)',
      browserChallenged: 'Cloudflare не пропустил и браузер. Попробуй позже.',
      noBrowser: 'Не найден ни один браузер на Chromium (Chrome, Edge, Яндекс, Opera, Brave, Vivaldi)',
      noDebugPort: '{name} не открыл порт отладки',
      challengeTimeout: 'Сайт не пропустил браузер за 60 секунд. Попробуй позже.',
      curlRequest: 'не удалось выполнить запрос: {why}',
      itemsFailed: 'Не удалось загрузить список предметов с OpenDota: {why}',
      http: 'D2PT {path}: HTTP {status}',
    },
    curl: {
      5: 'не удалось связаться с прокси-сервером',
      6: 'не удалось определить адрес dota2protracker.com (проблема с DNS или нет интернета)',
      7: 'не удалось подключиться к dota2protracker.com (блокировка провайдера, файрвол или антивирус)',
      28: 'сервер не ответил за 30 секунд',
      35: 'не удалось установить защищённое соединение (часто это антивирус, VPN или блокировка провайдера)',
      60: 'не удалось проверить сертификат сайта (часто это антивирус с проверкой HTTPS или корпоративный прокси)',
    },
  },

  en: {
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
      badCache: 'Unexpected remotecache.vdf format',
      limited: 'D2PT is rate-limiting requests right now. Try again in a couple of hours.',
      curlOnly: 'Cloudflare is blocking curl and the browser mode is off (--fetch curl)',
      browserChallenged: 'Cloudflare blocked the browser too. Try again later.',
      noBrowser: 'No Chromium-based browser found (Chrome, Edge, Yandex, Opera, Brave, Vivaldi)',
      noDebugPort: '{name} did not open its debugging port',
      challengeTimeout: 'The site did not let the browser through within 60 seconds. Try again later.',
      curlRequest: 'could not make the request: {why}',
      itemsFailed: 'Could not load the item list from OpenDota: {why}',
      http: 'D2PT {path}: HTTP {status}',
    },
    curl: {
      5: 'could not reach the proxy server',
      6: 'could not resolve dota2protracker.com (DNS problem or no internet)',
      7: 'could not connect to dota2protracker.com (ISP block, firewall or antivirus)',
      28: 'the server did not answer within 30 seconds',
      35: 'could not establish a secure connection (often antivirus, VPN or an ISP block)',
      60: 'could not verify the site certificate (often antivirus HTTPS scanning or a corporate proxy)',
    },
  },
};

const DEFAULT_LANG = 'ru';
const langOf = lang => (STRINGS[lang] ? lang : DEFAULT_LANG);

function t(lang, key, vars = {}) {
  const dict = STRINGS[langOf(lang)];
  const str = key.split('.').reduce((o, k) => (o || {})[k], dict);
  if (str == null) return key;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

module.exports = { t, STRINGS, DEFAULT_LANG, langOf };
