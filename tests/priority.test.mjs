import assert from 'node:assert/strict';
import test from 'node:test';
import {isMagik,partition,orderTree,orderMenu,wrapMethod,wrapSearch} from '../web/priority.mjs';
const a={name:'A'},m={name:'MagikOne'},n={name:'MagikTwo'};

test('recognizes IDs, display names, static constructors and module/category segments',()=>{
 for(const node of [m,{display_name:'Magik X'},{python_module:'custom_nodes.Magik_X'},{category:'Tools/Magik'},Object.assign(function(){},{title:'Magik Node'})])assert.equal(isMagik(node),true);
 for(const node of [null,{},'ImageMagik',{description:'Magik'}])assert.equal(isMagik(node),false);
});
test('stable priority keeps membership, object references and the input intact',()=>{
 const input=Object.freeze([a,m,n]);assert.deepEqual(partition(input,isMagik),[m,n,a]);assert.deepEqual(input,[a,m,n]);
 const many=Array.from({length:10000},(_,i)=>({name:i%5?'Other'+i:'Magik'+i}));
 const ordered=partition(many,isMagik);assert.equal(new Set(ordered).size,many.length);assert.deepEqual(partition(ordered,isMagik),ordered);
});
test('tree transformation promotes descendant folders while preserving keys/data/actions',()=>{
 const click=()=>{},root={key:'root',children:[{key:'plain',data:a},{key:'tools',children:[{key:'m',data:m,click}]}]};
 const ordered=orderTree(root);assert.equal(ordered.children[0].key,'tools');assert.equal(ordered.children[0].children[0].data,m);assert.equal(ordered.children[0].children[0].click,click);assert.equal(root.children[0].data,a);
});
test('context menu separators and action groups stay in position',()=>{
 const input=['Add Node','Search',null,a,m,null,n,a];
 assert.deepEqual(orderMenu(input,isMagik),['Add Node','Search',null,m,a,null,n,a]);
});
test('method wrappers preserve this/arguments and avoid overwriting a later wrapper',()=>{
 const object={factor:2,multiply(value){return this.factor*value}};
 const restore=wrapMethod(object,'multiply',original=>function(...args){return original.apply(this,args)+1});
 assert.equal(object.multiply(3),7);assert.equal(restore(),true);assert.equal(object.multiply(3),6);
 const restore2=wrapMethod(object,'multiply',f=>function(...args){return f.apply(this,args)});
 const later=()=>99;object.multiply=later;assert.equal(restore2(),false);assert.equal(object.multiply,later);
});
test('search wrapper orders before cutoff without mutating options or introducing incompatible nodes',()=>{
 class Search{searchNode(query,filters,options,extra){this.last={query,filters,options,extra};return this.nodes.filter(n=>n.type===filters[0]).slice(0,options?.limit||Infinity)}}
 const service=new Search();service.nodes=[...Array.from({length:100},(_,i)=>({name:'Other'+i,type:'IMAGE'})),{name:'MagikImage',type:'IMAGE'},{name:'MagikMask',type:'MASK'}];
 let enabled=true;const restore=wrapSearch(service,()=>enabled);const options=Object.freeze({limit:64,custom:'keep'}),extra={matchWildcards:false};
 const result=service.searchNode('image',['IMAGE'],options,extra);assert.equal(result[0].name,'MagikImage');assert.equal(result.length,64);assert.equal(result.some(n=>n.type==='MASK'),false);
 assert.equal(options.limit,64);assert.equal(service.last.options.custom,'keep');assert.equal(service.last.extra,extra);
 enabled=false;assert.equal(service.searchNode('image',['IMAGE'],options)[0].name,'Other0');assert.equal(service.last.options,options);restore();
});
test('all matching Magik results remain available for the newer search category filter',()=>{
 class Search{searchNode(){return Array.from({length:100},(_,i)=>({name:'Magik'+i,category:i<90?'Other':'Wanted'}))}}
 const service=new Search(),restore=wrapSearch(service,()=>true);
 const results=service.searchNode('',[],{limit:64}).filter(n=>n.category==='Wanted');
 assert.equal(results.length,10);restore();
});
test('registry proxy preserves nonconfigurable keys, constructors and later registrations',()=>{
 const registry={Other:a,MagikOne:m};Object.defineProperty(registry,'Fixed',{value:n,enumerable:true,configurable:false});
 const proxy=new Proxy(registry,{ownKeys:target=>partition(Reflect.ownKeys(target),key=>isMagik(target[key]))});
 assert.deepEqual(Object.keys(proxy),['MagikOne','Fixed','Other']);assert.equal(proxy.Other,a);
 proxy.New={name:'MagikNew'};assert.equal(registry.New,proxy.New);assert.equal(Reflect.ownKeys(proxy).length,4);
});
