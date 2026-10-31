// Offline artifact syntax/integrity check. Does not test the Android product.
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'evidence.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const elements = {
  '#q': {value: ''}, '#status': {value: ''}, '#count': {textContent: ''},
  '#grid': {innerHTML: ''}
};
vm.runInNewContext(script, {
  document: {
    querySelector: key => elements[key],
    querySelectorAll: () => []
  }, window: {}
});
if ((elements['#grid'].innerHTML.match(/<article /g) || []).length !== 66) throw Error('Card count');
elements['#q'].value = 'F01'; elements['#q'].oninput();
if (!elements['#grid'].innerHTML.includes('57-shot-available.png')) throw Error('Search missing F01');
elements['#q'].value = ''; elements['#status'].value = 'visual-only'; elements['#status'].onchange();
if ((elements['#grid'].innerHTML.match(/<article /g) || []).length !== 1) throw Error('Status filter');
const result = JSON.parse(fs.readFileSync(path.join(__dirname, 'validation.json'), 'utf8'));
result.browserArtifactChecks = ['JavaScript compiles', '66 cards render with DOM stub', 'F01 search', 'visual-only filter'];
result.browserArtifactLimits = 'No full browser visual or native interaction verification; this checks generated offline artifact only.';
fs.writeFileSync(path.join(__dirname, 'validation.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({offlineArtifactScript: 'passed', cardCount: 66, searchAndFilter: 'passed'}));
