// Transformers emits its default asyncify WASM even though inference.worker.ts
// explicitly selects the pinned same-origin non-asyncify runtime. Do not ship
// that unused fallback: it exceeds the host's 25 MiB per-file limit.
import {readdir,readFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assets=resolve(root,'dist/assets');
const expected=createHash('sha256').update(await readFile(resolve(root,'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm'))).digest('hex');
for(const name of await readdir(assets)){
 if(!/^ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm$/.test(name))continue;
 const path=resolve(assets,name);
 if(createHash('sha256').update(await readFile(path)).digest('hex')!==expected)throw new Error('Unexpected fallback artifact; inspect before pruning.');
 await unlink(path);
 console.log('Removed unselected runtime fallback:',name);
}
