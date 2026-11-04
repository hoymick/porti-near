export async function readDocument(file){
 if(file.size>3*1024*1024)throw new Error('Choose a file smaller than 3 MB.');
 if(file.name.toLowerCase().endsWith('.pdf')){
   const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
   pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
   const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,useSystemFonts:false});
   let pdf;
   try{
     pdf=await loading.promise;if(pdf.numPages>20)throw new Error('Use a PDF with 20 pages or fewer.');
     const pages=[];let length=0;
     for(let n=1;n<=pdf.numPages;n++){
       const page=await pdf.getPage(n),content=await page.getTextContent();
       const text=content.items.map(x=>'str' in x?x.str+(x.hasEOL?'\n':' '):'').join('').trim();
       if(text)pages.push(`[Page ${n}]\n${text}`);length+=text.length;if(length>29000)throw new Error('This document exceeds the 30,000 character limit.');page.cleanup();
     }
     if(!pages.length)throw new Error('No readable text found. Scanned PDFs need OCR and are not supported.');
     return pages.join('\n\n');
   }catch(e){if(e.name==='PasswordException')throw new Error('Password-protected PDFs are not supported. Export an unlocked copy.');throw e;}
   finally{await loading.destroy();}
 }
 if(!/\.(txt|md)$/i.test(file.name))throw new Error('Choose a text PDF, TXT or Markdown file.');
 const text=await file.text();if(text.length>30000)throw new Error('Documents are limited to 30,000 characters.');
 if(!text.trim())throw new Error('This file is empty.');return text;
}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function reportHtml(task,jobs,mode='sandbox'){
 const e=escapeHtml,o=task.output;
 if(!o?.changes)throw new Error('Complete this task before exporting a report.');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(task.title)} — WIF PORT</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:48px auto;padding:0 24px;color:#203027;background:#fbfcf7}h1{font-size:32px;line-height:1.15}header{border-bottom:3px solid #203027;padding-bottom:20px}small{color:#66745f}article{padding:20px;border:1px solid #dce3d4;border-radius:14px;margin:20px 0;background:white}.before,.after{padding:14px;border-radius:8px;white-space:pre-wrap}.before{background:#fff0e6}.after{background:#eef8df}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:12px;border:1px solid #dce3d4}th{background:#eaf4d8}footer{margin:40px 0;font-size:13px}@media print{body{margin:0;max-width:none}article{break-inside:avoid}}</style></head><body><header><small>WIF PORT · ${mode==='sandbox'?'SANDBOX — NO REAL TOKENS':'ONCHAIN SERVICE RECEIPT'}</small><h1>${e(task.title)}</h1><p>${e(o.summary)}</p></header><h2>Changes</h2>${o.changes.map(c=>`<article><strong>${e(c.kind.toUpperCase())}</strong> <small>${e(c.refs.join(' → '))}</small>${c.before?`<div class="before"><small>ORIGINAL</small><br>${e(c.before)}</div>`:''}${c.after?`<div class="after"><small>UPDATED</small><br>${e(c.after)}</div>`:''}</article>`).join('')}<h2>Itemized receipt</h2><table><thead><tr><th>Service</th><th>Status</th><th>Amount</th><th>Included fee</th></tr></thead><tbody>${jobs.map(j=>`<tr><td>${e(j.serviceName)}</td><td>${e(j.status)}</td><td>${e(j.displayTotal??j.total/1000000)} ${mode==='sandbox'?'test credits':'WIF'}</td><td>${e(j.displayFee??j.fee/1000000)}</td></tr>`).join('')}</tbody></table><footer>${e(o.method)} Results may require manual review.<br>Generated ${e(o.generatedAt)}. ${mode==='sandbox'?'Payments in this report are simulated.':''}</footer></body></html>`;
}
