import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {replaceComputed,interceptProp,isMagik,partition,orderTree,orderSections} from '../web/priority.mjs';
const directory=process.env.MAGIK_FRONTEND_STATIC;
const runtime=directory?await import(pathToFileURL(path.join(directory,'assets/vendor-vue-core-y4MynkKA.js')).href):null;
const vue=runtime?Object.fromEntries(['computed','ref','shallowRef','shallowReactive','toRaw','isRef','createPinia','defineStore'].map(name=>[name,Object.values(runtime).find(value=>typeof value==='function'&&value.name===name)])):null;
const options={skip:!vue};
const a={name:'A'},m={name:'MagikOne'};

test('production Pinia getter replacement invalidates cached consumers and restores',options,()=>{
 const source=vue.ref([a,m]),enabled=vue.ref(true);
 const store=vue.defineStore('test-node-frequency',()=>({topNodeDefs:vue.computed(()=>source.value)}))(vue.createPinia());
 const consumer=vue.computed(()=>store.topNodeDefs.map(n=>n.name));
 assert.deepEqual(consumer.value,['A','MagikOne']);
 const restore=replaceComputed(store,'topNodeDefs',vue,nodes=>enabled.value?partition(nodes,isMagik):nodes);
 assert.deepEqual(consumer.value,['MagikOne','A']);enabled.value=false;assert.deepEqual(consumer.value,['A','MagikOne']);
 source.value=[m,a];assert.deepEqual(consumer.value,['MagikOne','A']);
 assert.equal(restore(),true);source.value=[a,m];assert.deepEqual(consumer.value,['A','MagikOne']);
});
test('production Vue root-prop interception survives alphabetic replacements, toggles and restores',options,()=>{
 const original={children:[{key:'a',data:a},{key:'m',data:m}]};
 const instance={props:vue.shallowReactive({root:original})},enabled=vue.ref(true);
 const consumer=vue.computed(()=>instance.props.root.children.map(n=>n.data.name));
 assert.deepEqual(consumer.value,['A','MagikOne']);
 const restore=interceptProp(instance,'root',vue,tree=>enabled.value?orderTree(tree):tree);
 assert.deepEqual(consumer.value,['MagikOne','A']);enabled.value=false;assert.deepEqual(consumer.value,['A','MagikOne']);
 enabled.value=true;instance.props.root={children:[{key:'a',data:a},{key:'m',data:m}]};
 assert.deepEqual(consumer.value,['MagikOne','A']);assert.equal(restore(),true);assert.deepEqual(consumer.value,['A','MagikOne']);
 assert.equal(original.children[0].data,a);
});
test('production Vue section-prop interception covers the V2 final sort without changing node data',options,()=>{
 const sections=[{category:'core',root:{children:[{data:a}]}},{category:'extensions',root:{children:[{data:a},{data:m}]}}];
 const instance={props:vue.shallowReactive({sections})};
 const consumer=vue.computed(()=>instance.props.sections.map(s=>s.category));
 assert.deepEqual(consumer.value,['core','extensions']);const restore=interceptProp(instance,'sections',vue,orderSections);
 assert.deepEqual(consumer.value,['extensions','core']);assert.equal(instance.props.sections[0].root.children[0].data,m);
 restore();assert.deepEqual(consumer.value,['core','extensions']);assert.equal(sections[0].category,'core');
});

test('a lazy production Pinia store can be created before any UI consumer opens it',options,async()=>{
 const {getOrCreateStore}=await import('../web/priority.mjs');
 const pinia=vue.createPinia();
 const useFrequency=vue.defineStore('nodeFrequency',()=>({topNodeDefs:vue.computed(()=>[a,m])}));
 assert.equal(pinia._s.has('nodeFrequency'),false);
 const result=getOrCreateStore(pinia,{obfuscated:useFrequency},'nodeFrequency');
 assert.equal(result,pinia._s.get('nodeFrequency'));assert.equal(result.topNodeDefs[1],m);
});
