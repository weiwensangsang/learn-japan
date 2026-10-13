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
  function makeReadingChoices(item,pool,random=Math.random){const readings=[...new Set(pool.map(k=>k.romaji))].filter(reading=>reading!==item.romaji);return shuffle([item.romaji,...shuffle(readings,random).slice(0,3)],random);}
  function score(answers){return {total:answers.length,correct:answers.filter(a=>a.correct).length,wrong:answers.filter(a=>!a.correct)};}
  const api={shuffle,makeDeck,makeReadingChoices,score};root.KanaCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
