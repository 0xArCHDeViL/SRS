// Inject import into app.js
const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');
content = `import { startQuizMenulisSession } from './mode-menulis.js';\n` + content;
fs.writeFileSync('js/app.js', content);
