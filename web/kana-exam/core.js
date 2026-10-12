(function(root){
  'use strict';
  function shuffle(items,random=Math.random){const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function makeDeck(pool,count=20,random=Math.random){if(!pool.length)throw new Error('请至少选择一行假名。');const n=count==='all'?pool.length:Math.max(1,Number(count)||20);const deck=[];while(deck.length<n){const round=shuffle(pool,random);if(round.length>1&&deck.length&&round[0].kana===deck[deck.length-1].kana)[round[0],round[1]]=[round[1],round[0]];deck.push(...round.slice(0,n-deck.length));}return deck;}
  function makeReadingChoices(item,pool,random=Math.random){const readings=[...new Set(pool.map(k=>k.romaji))].filter(reading=>reading!==item.romaji);return shuffle([item.romaji,...shuffle(readings,random).slice(0,3)],random);}
  function score(answers){return {total:answers.length,correct:answers.filter(a=>a.correct).length,wrong:answers.filter(a=>!a.correct)};}
  const api={shuffle,makeDeck,makeReadingChoices,score};root.KanaCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
