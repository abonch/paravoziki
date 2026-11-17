import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('docs',{recursive:true});for(const name of ['index.html','app.js','model.js','style.css','logo.svg','train.svg'])await writeFile('docs/'+name,await readFile('dist/'+name));
await writeFile('docs/config.js','globalThis.PARAVOZIKI_API_BASE="https://time-blocks-asya.exact-thyme-2530.chatgpt.site";\n');
await writeFile('docs/.nojekyll','');console.log('GitHub Pages client prepared in docs/');
