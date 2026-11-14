/** Real MCP handshake and chain view only: no accounts created, no keys imported. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { allowedTools } from './policy.mjs';
const client=new Client({name:'accoryn-near-verification',version:'1.0.0'});
try {
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url))],stderr:'inherit'}));
 const {tools}=await client.listTools();
 assert.deepEqual(tools.map(t=>t.name).sort(),[...allowedTools].sort());
 const denied=await client.callTool({name:allowedTools[0],arguments:{networkId:'mainnet',accountId:'alice.near'}});
 assert.equal(denied.isError,true);
 const deniedWrite=await client.callTool({name:'tokens_send_near',arguments:{}});
 assert.equal(deniedWrite.isError,true);
 const result=await client.callTool({name:'contract_call_raw_function_as_read_only',arguments:{contractId:'ceremony-gate-v1.accoryn.testnet',methodName:'get_config',args:{}}});
 const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 assert.equal(result.isError,undefined);
 assert.match(text,/sputnikv2\.testnet/);
 console.log('PASS: official MCP handshake, three read-only tools, mainnet/write denial, actual deployed gate get_config.');
 console.log(text);
} finally {await client.close();}
