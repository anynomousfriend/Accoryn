/** Read-only development adapter; never a transaction signer or custody service. */
export const allowedTools = Object.freeze([
 'account_view_account_summary',
 'contract_view_functions',
 'contract_call_raw_function_as_read_only',
]);
export function testnetRead(name,args={}) {
 if(!allowedTools.includes(name)) throw new Error('Only read-only NEAR tools are enabled in this project.');
 if(args.networkId !== undefined && args.networkId !== 'testnet') throw new Error('This project adapter supports testnet only.');
 return {...args,networkId:'testnet'};
}
