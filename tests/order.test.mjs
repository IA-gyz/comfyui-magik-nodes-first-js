import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrder,nodeId,nodeRank,rankItems,rankItemsBy,rankNodes,rankNodesFit,rankTree,moveId,editorIds,menuRank,menuFit,socketFilter,linkFilter,fitRank} from '../web/order.mjs';
import {orderMenu,wrapSearch} from '../web/priority.mjs';
const a={name:'Other'},m={name:'MagikA'},n={name:'MagikB'},fresh={name:'MagikNew'};
test('normalizes saved data, preserves IDs and removes duplicates',()=>{
 assert.deepEqual(normalizeOrder(['MagikB',null,7,'','  ','MagikB','MagikA']),['MagikB','MagikA']);assert.deepEqual(normalizeOrder('invalid'),[]);
 assert.equal(nodeId(Object.assign(function ComfyNode(){},{type:'MagikB'})),'MagikB');
});
test('custom order wins within Magik; unlisted new nodes follow; other nodes stay stable',()=>{
 const input=Object.freeze([a,m,fresh,n,{name:'Other2'}]);
 assert.deepEqual(rankNodes(input,['MagikB','MagikA']),[n,m,fresh,a,input[4]]);
 assert.deepEqual(rankNodes(input,[]),[m,fresh,n,a,input[4]]);
});
test('node IDs disambiguate duplicate display names and stale preferences remain harmless',()=>{
 const left={name:'MagikLeft',display_name:'Same'},right={name:'MagikRight',display_name:'Same'};
 assert.deepEqual(rankNodes([left,right],['MagikMissing','MagikRight']),[right,left]);
 assert.deepEqual(editorIds([m,n],['MagikMissing','MagikB']),['MagikMissing','MagikB','MagikA']);
});
test('ranked trees promote categories using their earliest preferred descendant',()=>{
 const root={children:[{key:'first',children:[{data:m}]},{key:'second',children:[{data:n}]}]};
 const ordered=rankTree(root,nodeRank(['MagikB','MagikA']));assert.equal(ordered.children[0].key,'second');assert.equal(root.children[0].key,'first');
});
test('ranked menus preserve separators while applying saved order',()=>{
 const score=nodeRank(['MagikB','MagikA']);
 assert.deepEqual(orderMenu(['Action',null,a,m,n,null,'Search'],()=>false,run=>rankItems(run,score)),['Action',null,n,m,a,null,'Search']);
});
test('search applies edited order before its cutoff and preserves eligible membership',()=>{
 class Search{searchNode(){return [a,m,n]}}
 const service=new Search();let order=['MagikB','MagikA'];const restore=wrapSearch(service,()=>true,nodes=>rankNodes(nodes,order));
 assert.deepEqual(service.searchNode('',[],{limit:1}),[n,m]);order=['MagikA','MagikB'];assert.deepEqual(service.searchNode('',[],{limit:1}),[m,n]);restore();
});
test('moving items clamps destinations and never duplicates or drops IDs',()=>{
 assert.deepEqual(moveId(['a','b','c'],'b',0),['b','a','c']);assert.deepEqual(moveId(['a','b','c'],'a',20),['b','c','a']);assert.deepEqual(moveId(['a','b'],'x',0),['a','b']);
});

test('menu categories use the highest ranked eligible descendant and exclude hidden or filtered nodes',async()=>{
 const {menuRank}=await import('../web/order.mjs');
 const registry={MagikA:{...m,category:'Tools/A'},MagikB:{...n,category:'Tools/B'},Hidden:{name:'MagikHidden',category:'Other',skip_list:true},Filtered:{name:'MagikFiltered',category:'Filtered',filter:'special'}};
 const rank=menuRank(registry,['MagikHidden','MagikFiltered','MagikB','MagikA'],undefined);
 assert.equal(rank({value:'Tools/',has_submenu:true}),2);assert.equal(rank({value:'Tools/B/',has_submenu:true}),2);
 assert.equal(rank({value:'Other/',has_submenu:true}),Infinity);assert.equal(rank({value:'Filtered/',has_submenu:true}),Infinity);
 assert.equal(rank('MagikB'),2);assert.equal(rank({value:'Tools/B/'}),Infinity);
});
test('menuRank caches scores per registry and recomputes when the registry or order changes',()=>{
 const registry={MagikA:{name:'MagikA',category:'Tools/A'},Other:{name:'Other',category:'Other'}};
 const order=['MagikA'];
 const a=menuRank(registry,order,undefined),b=menuRank(registry,order,undefined);
 assert.equal(a,b);assert.equal(a('MagikA'),0);assert.equal(a('Other'),Infinity);
 const c=menuRank(registry,[],undefined);assert.notEqual(a,c);assert.equal(c('MagikA'),0);
 registry.MagikB={name:'MagikB',category:'Tools/B'};
 const d=menuRank(registry,order,undefined);assert.notEqual(a,d);assert.equal(d({value:'Tools/',has_submenu:true}),0);
});

test('socket and link filters extract the required socket side and type values',()=>{
 assert.deepEqual(socketFilter([{filterDef:{id:'output'},value:'VAE'}]),{side:'outputTypes',values:['VAE']});
 assert.deepEqual(socketFilter([{filterDef:{id:'input'},value:'IMAGE, MASK'}]),{side:'inputTypes',values:['IMAGE','MASK']});
 assert.equal(socketFilter([{filterDef:{id:'category'},value:'VAE'}]),null);
 assert.equal(socketFilter(['IMAGE']),null);
 assert.equal(socketFilter([{filterDef:{id:'output'},value:'*'}]),null);
 assert.equal(socketFilter(undefined),null);
 assert.deepEqual(linkFilter({toType:'output',fromSlot:{type:'VAE'}}),{side:'outputTypes',values:['VAE']});
 assert.deepEqual(linkFilter({toType:'input',fromSlot:{type:'IMAGE'}}),{side:'inputTypes',values:['IMAGE']});
 assert.equal(linkFilter({toType:'input',fromSlot:{type:'*'}}),null);
 assert.equal(linkFilter({toType:'input',fromSlot:{type:0}}),null);
 assert.equal(linkFilter(null),null);
});
test('fit ranks exact socket matches first, wildcard matches next, the rest last',()=>{
 const fit=fitRank({side:'outputTypes',values:['VAE']});
 assert.equal(fit({outputTypes:['VAE','IMAGE']}),0);
 assert.equal(fit({outputTypes:['*']}),1);
 assert.equal(fit({outputTypes:['IMAGE']}),2);
 assert.equal(fit({}),2);
 assert.equal(fitRank(null)({outputTypes:['VAE']}),2);
});
test('fit ranking leads, saved Magik order breaks ties, membership is preserved',()=>{
 const vae={name:'OtherVae',outputTypes:['VAE']},star={name:'MagikStar',outputTypes:['*']},exact={name:'MagikVae',outputTypes:['VAE']},none={name:'Other'};
 const input=Object.freeze([none,star,vae,exact]),fit=fitRank({side:'outputTypes',values:['VAE']});
 assert.deepEqual(rankNodesFit(input,['MagikStar','MagikVae'],fit),[exact,vae,star,none]);
 assert.deepEqual(rankNodesFit(input,[],fit),[exact,vae,star,none]);
 assert.deepEqual(rankNodesFit(input,['MagikVae'],fitRank(null)),[exact,star,none,vae]);
 assert.deepEqual(rankItemsBy([3,1,2],v=>[v%2,v]),[2,1,3]);
});
test('menu fit scores use the best fitting descendant and cache per registry context',()=>{
 const registry={
  MagikVae:{name:'MagikVae',category:'Tools/A',outputTypes:['VAE']},
  OtherStar:{name:'OtherStar',category:'Tools/A',outputTypes:['*']},
  Plain:{name:'Plain',category:'Other',outputTypes:['IMAGE']},
  Hidden:{name:'MagikHidden',category:'Other',outputTypes:['VAE'],skip_list:true}
 };
 const fit=fitRank({side:'outputTypes',values:['VAE']}),key='outputTypes:VAE';
 const score=menuFit(registry,undefined,key,fit);
 assert.equal(score('MagikVae'),0);assert.equal(score('OtherStar'),1);assert.equal(score('Plain'),2);
 assert.equal(score({value:'Tools/',has_submenu:true}),0);assert.equal(score({value:'Other/',has_submenu:true}),2);
 assert.equal(score({value:'Tools/B/'}),2);assert.equal(score('NotRegistered'),2);assert.equal(score({value:'Action'}),2);
 assert.equal(menuFit(registry,undefined,key,fit),score);
 assert.notEqual(menuFit(registry,undefined,'outputTypes:IMAGE',fit),score);
 registry.MagikNew={name:'MagikNew',category:'Tools/B',outputTypes:['VAE']};
 const grown=menuFit(registry,undefined,key,fit);
 assert.notEqual(grown,score);assert.equal(grown({value:'Tools/B/',has_submenu:true}),0);
});
