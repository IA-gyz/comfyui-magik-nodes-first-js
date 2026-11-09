import test from 'node:test';
import assert from 'node:assert/strict';
import {openOrderEditor} from '../web/order_editor.mjs';
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.dataset={};this.attributes={};this.scrollTop=0;}
 get isConnected(){return this.tagName==='BODY'||Boolean(this.parent?.isConnected)}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}}
 replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes)}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(key,listener){const list=this.listeners.get(key)||[];list.push(listener);this.listeners.set(key,list)}
 async fire(key,event={}){for(const fn of this.listeners.get(key)||[])await fn(event)}
 focus(){globalThis.document.activeElement=this}
 showModal(){this.open=true}
 close(){this.open=false;for(const fn of this.listeners.get('close')||[])fn({})}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}
}
function open(saved=[],save=async()=>{}){
 const body=new Element('body');globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag)};
 openOrderEditor({getNodes:()=>[{name:'MagikA',display_name:'Alpha'},{name:'MagikB',display_name:'Beta'}],readOrder:()=>saved,saveOrder:save});
 const dialog=body.children[0],list=dialog.children.find(e=>e.tagName==='OL'),footer=dialog.children.find(e=>e.tagName==='FOOTER');
 return {dialog,list,button:label=>footer.children.find(e=>e.textContent===label)};
}
test('editor arrow movement saves backend IDs, then closes',async()=>{
 let saved;const ui=open([],async ids=>saved=ids);
 await ui.list.children[1].children.find(e=>e.textContent==='↑').fire('click');
 assert.deepEqual(ui.list.children.map(r=>r.dataset.nodeId),['MagikB','MagikA']);await ui.button('Save order').fire('click');
 assert.deepEqual(saved,['MagikB','MagikA']);assert.equal(ui.dialog.isConnected,false);
});
test('cancel discards the draft and reset saves the default preference',async()=>{
 let writes=0;let ui=open(['MagikB','MagikA'],async()=>writes++);await ui.button('Cancel').fire('click');assert.equal(writes,0);
 let result;ui=open(['MagikB','MagikA'],async ids=>result=ids);await ui.button('Reset to default').fire('click');
 assert.deepEqual(ui.list.children.map(r=>r.dataset.nodeId),['MagikA','MagikB']);await ui.button('Save order').fire('click');assert.deepEqual(result,[]);
});
test('failed persistence keeps the dialog open and allows retry',async()=>{
 const ui=open([],async()=>{throw Error('offline')});await ui.button('Save order').fire('click');
 assert.equal(ui.dialog.isConnected,true);assert.equal(ui.button('Save order').disabled,false);assert.match(ui.dialog.children.find(e=>e.className==='error').textContent,/offline/);ui.dialog.close();
});
test('drag and drop reorders the draft',async()=>{
 const ui=open();await ui.list.children[1].fire('dragstart',{dataTransfer:{setData(){}}});
 await ui.list.children[0].fire('drop',{preventDefault(){}});assert.deepEqual(ui.list.children.map(r=>r.dataset.nodeId),['MagikB','MagikA']);ui.dialog.close();
});
