const fs = require('fs');
const https = require('https');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(resolve);
      });
    }).on('error', function(err) {
      fs.unlink(dest);
      reject(err.message);
    });
  });
}

async function run() {
    await download('https://raw.githubusercontent.com/asdfjkl/kanjicanvas/master/kanji-canvas.min.js', 'js/vendor/kanji-canvas.min.js');
    await download('https://raw.githubusercontent.com/asdfjkl/kanjicanvas/master/ref-patterns.js', 'js/vendor/ref-patterns.js');
    console.log("Done");
}
run();
