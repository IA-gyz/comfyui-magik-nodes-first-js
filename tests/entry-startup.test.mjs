import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const directory=process.env.MAGIK_FRONTEND_STATIC;
const url=name=>pathToFileURL(path.join(directory,'assets',name)).href;
const runtime=directory?await import(url('vendor-vue-core-y4MynkKA.js')):null;

test('actual extension entry returns from setup before Vue mounts, retries, creates the lazy store, installs and restores', {skip:!runtime}, async()=>{
 const fn=name=>Object.values(runtime).find(value=>typeof value==='function'&&value.name===name);
 const defineStore=fn('defineStore'),computed=fn('computed'),ref=fn('ref'),createPinia=fn('createPinia');
 const pinia=createPinia(),nodes=[{name:'Other'},{name:'MagikOne'},{name:'MagikTwo'}];
 class Search{searchNode(query,filters,options){return options?.limit?nodes.slice(0,options.limit):nodes}}
 const search=new Search();
 const defs=defineStore('nodeDef',()=>({visibleNodeDefs:ref(nodes),nodeSearchService:computed(()=>search),getNodeDefByName:name=>nodes.find(n=>n.name===name)}));
 defs(pinia);
 const frequency=defineStore('nodeFrequency',()=>({topNodeDefs:computed(()=>nodes),nodeNamesByFrequency:computed(()=>nodes.map(n=>n.name))}));
 assert.equal(pinia._s.has('nodeFrequency'),false);
 const organization={organizeNodes:()=>({children:nodes.map(data=>({data}))}),organizeNodesTab:()=>[]};
 let extension,element;
 const messages=[];
 const settingsValues=new Map([['Magik.NodesFirst.Order',['MagikTwo','MagikOne']]]);
 globalThis.__magikFixture={defs,frequency,organization,app:{extensionManager:{setting:{get:key=>settingsValues.get(key) ?? true,async set(key,value){settingsValues.set(key,value);extension.settings.find(s=>s.id===key)?.onChange(value)}}},registerExtension(e){extension=e}}};
 const serviceURL=url('settingStore-DZ2-HL-F.js');
 const appURL='data:text/javascript,'+encodeURIComponent('export const app=globalThis.__magikFixture.app');
 const namespaceURL='data:text/javascript,'+encodeURIComponent('export const d=globalThis.__magikFixture.defs; export const f=globalThis.__magikFixture.frequency; export const s=globalThis.__magikFixture.organization');
 registerHooks({resolve(specifier,context,next){
  if(specifier==='../../scripts/app.js')return {url:appURL,shortCircuit:true};
  if(specifier===serviceURL)return {url:namespaceURL,shortCircuit:true};
  return next(specifier,context);
 }});
 globalThis.document={baseURI:pathToFileURL(path.join(directory,'index.html')).href,getElementById:()=>element,querySelectorAll:()=>[]};
 globalThis.location={origin:'null'};
 Object.defineProperty(globalThis,'performance',{value:{getEntriesByType:()=>[{name:serviceURL},{name:url('vendor-vue-core-y4MynkKA.js')}]},configurable:true});
 globalThis.LiteGraph={registered_node_types:{Other:nodes[0],MagikOne:nodes[1],MagikTwo:nodes[2]},ContextMenu:class ContextMenu{constructor(values){this.values=values}}};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 const originalLog=console.info;console.info=(...args)=>messages.push(args);
 try {
  await import('../web/magik_nodes_first.js');
  assert.equal(globalThis.magikNodesFirst.status().phase,'registered');
  assert.equal(extension.setup(),undefined);
  async function until(predicate){const deadline=Date.now()+1500;while(!predicate()){if(Date.now()>deadline)assert.fail('timeout: '+JSON.stringify(globalThis.magikNodesFirst.status()));await new Promise(resolve=>setTimeout(resolve,5))}}
  await until(()=>globalThis.magikNodesFirst.status().phase==='waiting');
  assert.ok(globalThis.magikNodesFirst.status().missing.includes('mounted Vue app'));
  assert.equal(pinia._s.has('nodeFrequency'),true);
  assert.deepEqual(search.searchNode().map(n=>n.name),['Other','MagikOne','MagikTwo']);
  element={__vue_app__:{config:{globalProperties:{$pinia:pinia}},mixin(){},_instance:null},_vnode:null};
  await until(()=>globalThis.magikNodesFirst.active);
  assert.equal(globalThis.magikNodesFirst.status().version,'0.2.1');
  assert.equal(globalThis.magikNodesFirst.status().hooks.emptySearch,true);
  assert.deepEqual(search.searchNode('',[],{limit:64}).map(n=>n.name),['MagikTwo','MagikOne','Other']);
  assert.deepEqual(pinia._s.get('nodeFrequency').topNodeDefs.map(n=>n.name),['MagikTwo','MagikOne','Other']);
  assert.deepEqual(Object.keys(globalThis.LiteGraph.registered_node_types),['MagikTwo','MagikOne','Other']);
  assert.deepEqual(new globalThis.LiteGraph.ContextMenu(['Other','MagikOne','MagikTwo']).values,['MagikTwo','MagikOne','Other']);
  assert.equal(extension.getCanvasMenuItems()[0].content,'Magik node order…');
  await globalThis.__magikFixture.app.extensionManager.setting.set('Magik.NodesFirst.Order',['MagikOne','MagikTwo']);
  assert.deepEqual(search.searchNode('',[],{limit:64}).map(n=>n.name),['MagikOne','MagikTwo','Other']);
  assert.deepEqual(pinia._s.get('nodeFrequency').topNodeDefs.map(n=>n.name),['MagikOne','MagikTwo','Other']);
  assert.deepEqual(globalThis.magikNodesFirst.status().customOrder,['MagikOne','MagikTwo']);
  const restored=globalThis.magikNodesFirst.restore();assert.equal(restored.phase,'restored');
  assert.deepEqual(search.searchNode().map(n=>n.name),['Other','MagikOne','MagikTwo']);
 } finally {console.info=originalLog;globalThis.magikNodesFirst?.restore()}
});
