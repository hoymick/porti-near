import fs from 'node:fs';import path from 'node:path';import solc from 'solc';
export function compileContracts(){
 const sources=Object.fromEntries(['WifBudgetVault.sol','TestToken.sol'].map(name=>[name,{content:fs.readFileSync(new URL('../contracts/'+name,import.meta.url),'utf8')}]));
 const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}),{import:name=>{try{return {contents:fs.readFileSync(path.resolve('node_modules',name),'utf8')}}catch{return {error:'Import not found: '+name}}}}));
 const errors=(result.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 return {vault:result.contracts['WifBudgetVault.sol'].WifBudgetVault,token:result.contracts['TestToken.sol'].TestToken};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){const artifacts=compileContracts();fs.mkdirSync('outputs/contracts',{recursive:true});for(const [name,artifact]of Object.entries(artifacts))fs.writeFileSync(`outputs/contracts/${name}.json`,JSON.stringify(artifact,null,2));console.log('Vault and local test token compiled successfully.');}
