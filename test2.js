const fs = require('fs');
let text = fs.readFileSync('js/vendor/kanji-canvas.min.js', 'utf8');
console.log(text.substring(0, 200));
