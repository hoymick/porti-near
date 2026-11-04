/** Browser-session SDK for the sandbox. This is not a public API key scheme. */
export class WifPortClient {
  constructor({baseUrl='',fetcher=fetch}={}) {this.baseUrl=baseUrl.replace(/\/$/,'');this.fetcher=fetcher;}
  async request(path,body) {
    const response=await this.fetcher(this.baseUrl+path,{credentials:'same-origin',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error?.message||'Request failed'),{code:data.error?.code});return data;
  }
  workspace(){return this.request('/api/workspace');}
  createTask({title,documents,maxSpend='5',requestId=crypto.randomUUID()}){return this.request('/api/workspace',{action:'create-task',title,documents,maxSpend,requestId});}
  advance(taskId){return this.request(`/api/tasks/${encodeURIComponent(taskId)}/advance`,{});}
  async run(taskId,{onProgress=()=>{},signal,maxSteps=8}={}){
    for(let step=0;step<maxSteps;step++){
      signal?.throwIfAborted();const result=await this.advance(taskId);await onProgress(result);
      const task=result.state.tasks.find(t=>t.id===taskId);
      if(!task||['completed','blocked','failed','archived'].includes(task.status))return result;
      if(result.pending)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new Error('Task is still in progress. Query status before resuming.');
  }
}
