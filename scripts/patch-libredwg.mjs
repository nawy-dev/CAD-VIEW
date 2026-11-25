// يعدّل ملف الربط المولَّد من Emscripten (libredwg-web.js): يستبدل `new Function` في createJsInvoker
// (المستخدم في كل دوال embind، ومنها dwg_write_dxf) فيعمل التحويل تحت CSP بدون 'unsafe-eval'.
// قيد معروف: يبقى `new Function` واحد في __emval_create_invoker (لا يُستدعى إلا عند استخدام emscripten::val من C++، وهو غير مستخدم في مسار التحويل؛ يغطيه اختبار). السلوك مطابق تمامًا للأصلي (closures بدل توليد نص).
// الاستخدام: node scripts/patch-libredwg.mjs <مسار libredwg-web.js>  (آمن للتكرار)
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? 'public/vendor/libredwg/libredwg-web.js';
let src = readFileSync(file, 'utf8');
if (src.includes('/*cad-view-patched*/')) {
  console.log('already patched');
  process.exit(0);
}

const start = src.indexOf('function createJsInvoker(');
const end = src.indexOf('function craftInvokerFunction(');
if (start < 0 || end < 0 || end < start) throw new Error('createJsInvoker not found');

const replacement = `/*cad-view-patched*/function createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync){
var needsDestructorStack=usesDestructorStack(argTypes);
var argCount=argTypes.length-2;
var first=isClassMethodFunc?1:2;
return function(humanName,throwBindingError,invoker,fn,runDestructors,fromRetWire,toClassParamWire,...rest){
var toArgs=rest.slice(0,argCount);
var dtors=rest.slice(argCount);
return function(...args){
var destructors=needsDestructorStack?[]:null;
var thisWired;
if(isClassMethodFunc){thisWired=toClassParamWire(destructors,this)}
var wired=new Array(argCount);
for(var i=0;i<argCount;++i){wired[i]=toArgs[i](destructors,args[i])}
var rv=isClassMethodFunc?invoker(fn,thisWired,...wired):invoker(fn,...wired);
if(needsDestructorStack){runDestructors(destructors)}
else{var k=0;for(var j=first;j<argTypes.length;++j){if(argTypes[j].destructorFunction!==null){dtors[k++](j===1?thisWired:wired[j-2])}}}
if(returns){return fromRetWire(rv)}
}
}
}
`;
src = src.slice(0, start) + replacement + src.slice(end);
writeFileSync(file, src);
console.log('patched', file);
