import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrder,nodeId,nodeRank,rankItems,rankNodes,rankTree,moveId,editorIds} from '../web/order.mjs';
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
