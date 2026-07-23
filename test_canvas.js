let html = require('fs').readFileSync('index.html', 'utf8');
console.log(html.indexOf('<canvas'));
