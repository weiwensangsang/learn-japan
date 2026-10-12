// 从用户维护的速记法生成浏览器数据；不另外维护一套口诀。
const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../docs/gojuon-learning-method.md'),'utf8');
const groups=[['a','あ行','あいうえお'],['k','か行','かきくけこ'],['s','さ行','さしすせそ'],['t','た行','たちつてと'],['n','な行','なにぬねの'],['h','は行','はひふへほ'],['m','ま行','まみむめも'],['y','や行','やゆよ'],['r','ら行','らりるれろ'],['w','わ・ん','わをん']];
const data=[];for(const line of source.split(/\r?\n/)){const match=line.match(/^\| ([ぁ-ん]) \| ([^|]+) \| ([^|]+) \|$/);if(!match)continue;const kana=match[1];const group=groups.find(g=>g[2].includes(kana));if(!group)throw Error('未知假名 '+kana);data.push({kana,romaji:match[2].trim().split(/[（\s]/)[0],hint:match[3].trim(),row:group[0]});}
if(data.length!==46||new Set(data.map(k=>k.kana)).size!==46)throw Error('速记法必须包含 46 个独立假名');
const output='// 由 sync-data.cjs 从 docs/gojuon-learning-method.md 生成。\nwindow.KANA_ROWS = '+JSON.stringify(groups.map(([id,label,kana])=>({id,label,kana})),null,2)+';\nwindow.KANA_DATA = '+JSON.stringify(data,null,2)+';\n';
fs.writeFileSync(path.join(__dirname,'kana-data.js'),output);console.log('已同步 46 个平假名与个人速记提示。');
