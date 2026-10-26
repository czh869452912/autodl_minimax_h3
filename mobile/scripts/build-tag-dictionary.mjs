import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../assets/tags');
const output=path.join(root,'danbooru-v1.db');
if(fs.existsSync(output))fs.unlinkSync(output);
const db=new DatabaseSync(output);
db.exec('CREATE TABLE tags(name TEXT PRIMARY KEY,category INTEGER,count INTEGER,translation TEXT); CREATE TABLE terms(term TEXT,tag TEXT); BEGIN;');
const tag=db.prepare('INSERT OR IGNORE INTO tags VALUES(?,?,?,?)'),term=db.prepare('INSERT INTO terms VALUES(?,?)');
const translations={'blue_eyes':'蓝眼睛','blue_hair':'蓝头发','long_hair':'长发','short_hair':'短发','red_eyes':'红眼睛','black_hair':'黑发','white_hair':'白发','blonde_hair':'金发','smile':'微笑','starry_sky':'星空','sky':'天空','cloud':'云','clouds':'云朵','looking_at_viewer':'看向观众','solo':'单人','1girl':'一个女孩','1boy':'一个男孩','white_background':'白色背景','simple_background':'简单背景'};
function csv(line){const out=[];let v='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(v);v='';}else v+=c;}out.push(v);return out;}
let rows=0;
for(const line of fs.readFileSync(path.join(root,'danbooru.csv'),'utf8').split(/\r?\n/)){if(!line)continue;const [name,category,count,aliases='']=csv(line);if(!name||!Number.isFinite(+count))continue;const zh=translations[name]??'';tag.run(name,+category,+count,zh);for(const t of new Set([name,...aliases.split(','),zh].filter(Boolean).map(s=>s.toLowerCase().replaceAll('_',' '))))term.run(t,name);rows++;}
db.exec('COMMIT; CREATE INDEX terms_prefix ON terms(term,tag); PRAGMA user_version=1; VACUUM;');db.close();console.log({rows,bytes:fs.statSync(output).size});
