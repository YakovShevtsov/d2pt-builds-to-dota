const { openBrowserSession } = require('./src/browser');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const s = await openBrowserSession('https://dota2protracker.com', { log: console.log });
  const cdp = s._cdp;
  await cdp.send('Page.navigate', { url: 'https://dota2protracker.com/api/hero/2/builds?position=pos%203' });
  for (let i = 0; i < 12; i++) {
    await sleep(2000);
    const info = await cdp.eval('location.href + " || " + document.readyState + " || " + document.title + " || " + (document.body ? document.body.innerText.slice(0,60) : "no body")').catch(e => 'eval err: ' + e.message);
    console.log(i * 2 + 's:', info);
  }
  await s.close();
})();
