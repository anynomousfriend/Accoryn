import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { allowedTools, testnetRead } from './policy.mjs';
const require=createRequire(import.meta.url);
const keyDir=fileURLToPath(new URL('../../.local/near-mcp-keystore/',import.meta.url));
await mkdir(keyDir,{recursive:true});
const upstream=new Client({name:'accoryn-official-near-adapter',version:'1.0.0'});
await upstream.connect(new StdioClientTransport({
 command:process.execPath,
 args:[require.resolve('@nearai/near-mcp'),'run','--key-dir',keyDir],
 stderr:'inherit',
}));
const listed=await upstream.listTools();
const tools=listed.tools.filter(t=>allowedTools.includes(t.name)).map(t=>({
 ...t,
 inputSchema:{...t.inputSchema,properties:{...t.inputSchema.properties,networkId:{type:'string',enum:['testnet'],default:'testnet'}}},
}));
if(tools.length!==allowedTools.length)throw new Error('Pinned official MCP read-tool schema changed.');
const server=new Server({name:'accoryn-near-testnet',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
 try {
  return await upstream.callTool({name:request.params.name,arguments:testnetRead(request.params.name,request.params.arguments)});
 } catch(e) {
  return {isError:true,content:[{type:'text',text:e instanceof Error?e.message:'NEAR read failed.'}]};
 }
});
await server.connect(new StdioServerTransport());
async function close(){await server.close();await upstream.close();process.exit(0);}
process.once('SIGINT',close);process.once('SIGTERM',close);
