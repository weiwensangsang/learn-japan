(function(root){
  'use strict';
  function shuffle(items,random=Math.random){const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function makeDeck(pool,count=20,random=Math.random){
    if(!pool.length)throw new Error('请至少选择一行假名。');
    const uniquePool=[...new Map(pool.map(item=>[item.kana,item])).values()];
    const n=count==='all'?uniquePool.length:Math.min(uniquePool.length,Math.max(1,Math.floor(Number(count)||20)));
    const deck=shuffle(uniquePool,random).slice(0,n);
    // 混合题库至少出现两种字形；错字重考只有一种时仍只考错字。
    if(n>1&&new Set(uniquePool.map(item=>item.script)).size>1&&new Set(deck.map(item=>item.script)).size===1){
      deck[n-1]=shuffle(uniquePool.filter(item=>item.script!==deck[0].script),random)[0];
    }
    return deck;
  }
  function makeReadingChoices(item,pool,random=Math.random){const readings=[...new Set(item.distractors||pool.map(k=>k.romaji))].filter(reading=>reading!==item.romaji);return shuffle([item.romaji,...shuffle(readings,random).slice(0,3)],random);}
  function makeCardExamDeck(pool,random=Math.random){
    if(new Set(pool.map(item=>item.kana)).size<20)throw new Error('考试需要至少20张不同卡片，请多选一些分组。');
    return makeDeck(pool,20,random);
  }
  function score(answers){return {total:answers.length,correct:answers.filter(a=>a.correct).length,wrong:answers.filter(a=>!a.correct)};}
  const kanaSounds={};
  for(const [letters,readings] of [
    ['あいうえお','a i u e o'],['かきくけこ','ka ki ku ke ko'],['さしすせそ','sa shi su se so'],
    ['たちつてと','ta chi tsu te to'],['はひふへほ','ha hi fu he ho'],['きしちにひみり','ki shi chi ni hi mi ri'],
    ['がぎぐげご','ga gi gu ge go'],['ざじずぜぞ','za ji zu ze zo'],['だぢづでど','da ji zu de do'],
    ['ばびぶべぼ','ba bi bu be bo'],['ぱぴぷぺぽ','pa pi pu pe po'],['ゔ','vu']
  ]) [...letters].forEach((letter,i)=>{kanaSounds[letter]=readings.split(' ')[i];});
  const toHiragana=letter=>letter>='ァ'&&letter<='ヶ'?String.fromCharCode(letter.charCodeAt(0)-0x60):letter;
  // 解释以题库中已核对的拆音为准，不在浏览器里猜汉字读法。
  function explainWord(item){
    const rules=new Map(),parts=item.parts||[];
    const add=(kind,title,example,explanation)=>{
      if(!rules.has(kind))rules.set(kind,{kind,title,examples:[],explanation});
      const examples=rules.get(kind).examples;if(!examples.includes(example))examples.push(example);
    };
    for(const letter of [...item.kana.normalize('NFC')]){
      const [base,mark]=[...letter.normalize('NFD')];
      if(mark==='\u3099'||mark==='\u309a'){
        const semi=mark==='\u309a';
        add(semi?'handakuten':'dakuten',semi?'゜ 半浊点':'゛ 浊点',`${base} ${kanaSounds[toHiragana(base)]} → ${letter} ${kanaSounds[toHiragana(letter)]}`,
          semi?'右上小圆圈把は行的音变成 p 音；例如ハ ha → パ pa。':'右上两点会改变这个假名的读音，两点本身不单独读。');
      }
    }
    parts.forEach(([kana,rawReading],i)=>{
      const reading=rawReading.trim(),previous=parts[i-1],next=parts[i+1];
      if(kana==='ー'&&previous){
        add('long','ー 长音',`${previous[0]}${kana} → ${previous[1].trim()}${reading}`,
          `这条横线是长音符号，不是汉字“一”。把前一个音最后的元音延长一拍；罗马字用重复元音表示。`);
      }
      if(/^[ッっ]$/.test(kana)&&next){
        add('sokuon','ッ／っ 小促音',`${kana}${next[0]} → ${reading}${next[1].trim()}`,
          `小${kana}不读 tsu。给下一个辅音留一拍，再接下一个音；拆音里的 ${reading} 只是这个停顿或阻塞的记号，不单独读。`);
      }
      if(/[ャュョゃゅょ]/.test(kana)){
        const first=kana[0],small=kana.at(-1),large=String.fromCharCode(small.charCodeAt(0)+1);
        const firstSound=kanaSounds[toHiragana(first)];
        const lastSound={'ゃ':'ya','ゅ':'yu','ょ':'yo'}[toHiragana(small)];
        add('yoon','小ャュョ／ゃゅょ 合读',`${kana} → ${reading}`,
          `小${small}和前面的假名合成一拍，不能拆成两拍。${firstSound?`对比：${first}${large}（大${large}）读 ${firstSound}＋${lastSound}，是两拍。`:'按这里标出的读音连起来读。'}`);
      }
      if(/[ァィゥェォぁぃぅぇぉ]/.test(kana)){
        if(kana.length>1&&/([aiueo])\1$/.test(reading)){
          add('small-long','小元音：延长读音',`${kana} → ${reading}`,'这里小元音延长前面的同一个元音。例如ピィ pii，要把 i 延长一拍。');
        }else if(kana.length>1){
          add('small-vowel','小ァィゥェォ：外来音组合',`${kana} → ${reading}`,'小元音和前一个假名组合，按标出的整体读音读。例如ティ是 ti，不是 te＋i；フェ是 fe，不是 fu＋e。');
        }else{
          add('small-separate','小元音的读法',`${previous?previous[0]+kana:kana} → ${previous?previous[1].trim()+reading:reading}`,'小元音的读法要结合具体拼写看；这处按上面的拆音连读，不把它误认成大小相同的完整假名。');
        }
      }
      if(/^[・＝\s]+$/.test(kana))add('separator','・ 等分隔符',`${kana.trim()||'空格'} → 不发音`,'只用来分隔名字的部分，不增加读音；本页罗马字用空格表示。');
      if(reading==="n'")add('nasal',"n' 罗马字分隔",`${kana}${next?.[0]||''} → ${reading}${next?.[1].trim()||''}`,"撇号用来分开 n 和后面的元音或 y，避免读成 na、nya 等音；撇号本身不发音。");
    });
    if(!rules.size)add('plain','按基本假名连读',`${item.kana} → ${item.romaji}`,'这题没有需要另外解释的浊点、长音符号或小假名，照上面的拆音依次连起来读。');
    return [...rules.values()];
  }
  const normalizeReading=value=>String(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[\s-]+/g,'');
  function compareReading(item,input){
    const parts=item.parts.map(([kana,reading])=>({kana,expected:normalizeReading(reading),actual:'',segments:[]}));
    const target=parts.map(p=>p.expected).join(''),user=normalizeReading(input),owners=[];
    parts.forEach((part,index)=>{for(let i=0;i<part.expected.length;i++)owners.push(index);});
    const n=target.length,m=user.length;
    const cost=i=>/^[ーッっ]$/.test(parts[owners[i]].kana)?99:100;
    const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
    for(let i=n;i>=0;i--)for(let j=m;j>=0;j--){
      if(i===n)dp[i][j]=(m-j)*100;
      else if(j===m)dp[i][j]=cost(i)+dp[i+1][j];
      else dp[i][j]=Math.min((target[i]===user[j]?0:100)+dp[i+1][j+1],cost(i)+dp[i+1][j],100+dp[i][j+1]);
    }
    let i=0,j=0;
    const append=(index,expected,actual,status)=>{const part=parts[index];part.actual+=actual;part.segments.push({expected,actual,status});};
    while(i<n||j<m){
      if(i<n&&j<m&&dp[i][j]===(target[i]===user[j]?0:100)+dp[i+1][j+1]){
        append(owners[i],target[i],user[j],target[i]===user[j]?'correct':'wrong');i++;j++;
      }else if(i<n&&dp[i][j]===cost(i)+dp[i+1][j]){
        append(owners[i],target[i],'','missing');i++;
      }else{
        append(owners[Math.min(i,n-1)],'',user[j],'extra');j++;
      }
    }
    parts.forEach(part=>{part.status=!part.expected&&!part.segments.length?'separator':part.segments.every(s=>s.status==='correct')?'correct':'wrong';});
    return {correct:target===user,expected:target,user,parts};
  }
  function audioFailure(error={}){
    if(error.name==='AbortError')return '';
    if(error.name==='NotAllowedError')return '浏览器阻止了按钮播放，请直接点播放器里的 ▶。';
    if(error.code===2)return '音频读取中断，请重新点击播放；也可以单独打开音频。';
    if(error.name==='NotSupportedError'||error.code===3||error.code===4)return '浏览器未能载入或解码音频，可以点“单独打开音频”重试。';
    return '声音未能播放，请尝试播放器里的 ▶ 或“单独打开音频”。';
  }
  const api={shuffle,makeDeck,makeCardExamDeck,makeReadingChoices,score,explainWord,compareReading,audioFailure};root.KanaCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
