// ============================================================
// MINIMAL WORKING VERSION FOR DENO DEPLOY
// ============================================================

// HTML Template
const HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DailyMed Extractor</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;min-height:100vh}
        .container{max-width:1200px;margin:0 auto;background:white;border-radius:20px;padding:30px}
        h1{color:#333;margin-bottom:10px}
        .search-box{display:flex;gap:10px;margin:20px 0}
        .search-box input{flex:1;padding:12px;border:2px solid #ddd;border-radius:8px;font-size:16px}
        .search-box button{padding:12px 30px;background:#667eea;color:#fff;border:none;border-radius:8px;cursor:pointer}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
        .panel{background:#f8f9fa;border-radius:12px;padding:15px;min-height:300px}
        .panel h3{border-bottom:2px solid #667eea;padding-bottom:10px;margin-bottom:15px}
        .result-item{background:white;padding:12px;border-radius:8px;margin-bottom:8px;cursor:pointer}
        .result-item:hover{background:#f0edff}
        .result-item .name{font-weight:bold}
        .result-item .meta{font-size:12px;color:#888}
        .xml-box{background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;font-family:monospace;font-size:12px;max-height:300px;overflow-y:auto;white-space:pre-wrap}
        .status-bar{margin-top:20px;padding:15px;background:#e8f5e9;border-radius:8px;display:flex;justify-content:space-between}
        .tag{display:inline-block;padding:4px 12px;border-radius:16px;font-size:12px;margin:3px}
        .tag.company{background:#e3f2fd;color:#1565c0}
        .tag.labeler{background:#f3e5f5;color:#7b1fa2}
        .tag.ndc{background:#fff3e0;color:#e65100}
        .loading{display:inline-block;width:20px;height:20px;border:3px solid #f3f3f3;border-top:3px solid #667eea;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    </style>
</head>
<body>
<div class="container">
<h1>🏥 DailyMed Label Extractor</h1>
<div class="search-box">
<input type="text" id="searchInput" placeholder="Enter drug name (e.g., Adalimumab)" />
<button onclick="searchDrug()">🔍 Search</button>
<button onclick="clearAll()" style="background:#ef5350;">Clear</button>
</div>
<div class="grid">
<div class="panel"><h3>📋 Results</h3><div id="resultsList"><div style="color:#999;text-align:center;padding:40px 0;">Search for a drug</div></div></div>
<div class="panel"><h3>📊 Extracted Info</h3><div id="infoPanel"><div style="color:#999;text-align:center;padding:40px 0;">Select a result</div></div></div>
</div>
<div class="panel" style="margin-top:20px;"><h3>📄 XML Output</h3><div id="xmlPreview" class="xml-box"><span style="color:#666;">XML will appear here</span></div></div>
<div class="status-bar"><div id="statusMessage">Ready</div><div><button onclick="downloadXML()">💾 Download</button></div></div>
</div>
<script>
let currentResults=[],currentXML='',currentDrug=null;
function searchDrug(){const q=document.getElementById('searchInput').value.trim();if(!q)return alert('Enter a drug name');const btn=document.querySelector('.search-box button');btn.innerHTML='<span class="loading"></span>';document.getElementById('statusMessage').textContent='Searching...';fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})}).then(r=>r.json()).then(d=>{currentResults=d.results||[];displayResults(currentResults);document.getElementById('statusMessage').textContent='Found '+currentResults.length+' results';btn.innerHTML='🔍 Search';}).catch(err=>{alert('Error: '+err.message);btn.innerHTML='🔍 Search';});}
function displayResults(results){const c=document.getElementById('resultsList');if(!results||!results.length){c.innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">No results</div>';return;}c.innerHTML=results.map((d,i)=>'<div class="result-item" onclick="selectDrug('+i+')"><div class="name">'+d.name+'</div><div class="meta">NDC: '+(d.ndc||'N/A')+'</div></div>').join('');}
function selectDrug(index){const drug=currentResults[index];if(!drug)return;document.getElementById('statusMessage').textContent='Processing '+drug.name+'...';document.getElementById('infoPanel').innerHTML='<div style="text-align:center;padding:40px 0;"><span class="loading"></span> Extracting...</div>';fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(drug)}).then(r=>r.json()).then(d=>{if(d.error)throw new Error(d.error);currentXML=d.xml;currentDrug=d.drug_info;displayInfo(d);document.getElementById('xmlPreview').textContent=d.xml;document.getElementById('statusMessage').textContent='Complete!';}).catch(err=>{document.getElementById('infoPanel').innerHTML='<div style="color:red;padding:20px;">Error: '+err.message+'</div>';document.getElementById('statusMessage').textContent='Error';});}
function displayInfo(d){const info=d.label_info||{};let h='<div style="margin-bottom:15px;"><strong>'+d.drug_info.name+'</strong></div>';if(info.companies?.length){h+='<div><b>🏢 Companies:</b><br>'+info.companies.map(c=>'<span class="tag company">'+c+'</span>').join('')+'</div><br>';}if(info.labelers?.length){h+='<div><b>📦 Labelers:</b><br>'+info.labelers.map(l=>'<span class="tag labeler">'+l+'</span>').join('')+'</div><br>';}if(info.ndc_codes?.length){h+='<div><b>🔢 NDC Codes:</b><br>'+info.ndc_codes.map(n=>'<span class="tag ndc">'+n+'</span>').join('')+'</div><br>';}if(info.package_info?.length){h+='<div><b>📦 Package:</b><br>'+info.package_info.join('<br>')+'</div><br>';}h+='<div style="font-size:12px;color:#999;">Images: '+d.image_count+'</div>';document.getElementById('infoPanel').innerHTML=h;}
function downloadXML(){if(!currentXML)return alert('No XML to download');const b=new Blob([currentXML],{type:'application/xml'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(currentDrug?.name||'label')+'.xml';a.click();}
function clearAll(){currentResults=[];currentXML='';currentDrug=null;document.getElementById('resultsList').innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">Search for a drug</div>';document.getElementById('infoPanel').innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">Select a result</div>';document.getElementById('xmlPreview').textContent='XML will appear here';document.getElementById('statusMessage').textContent='Ready';}
document.getElementById('searchInput').addEventListener('keypress',e=>{if(e.key==='Enter')searchDrug();});
</script>
</body>
</html>`;

// ============================================================
// SIMPLE SEARCHER (No cheerio dependency)
// ============================================================

async function searchDrug(drugName: string): Promise<any[]> {
    try {
        const url = `https://dailymed.nlm.nih.gov/dailymed/search.cfm?q=${drugName}&searchtype=select`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const html = await response.text();
        const results = [];
        
        // Simple regex-based parsing (no cheerio needed)
        const regex = /<a href="\/dailymed\/drugInfo\.cfm\?setid=[^"]*">([^<]*)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const name = match[1].replace(/LABEL:|label:/g, '').trim();
            if (name) {
                results.push({
                    name: name,
                    ndc: '',
                    url: `https://dailymed.nlm.nih.gov${match[0].match(/href="([^"]*)"/)[1]}`
                });
            }
        }
        
        return results.slice(0, 20);
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

async function getPackageImages(drugUrl: string): Promise<string[]> {
    try {
        const response = await fetch(drugUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const images = [];
        
        // Find image URLs
        const imgRegex = /<img[^>]*src="([^"]*package[^"]*\.(?:jpg|png|jpeg))"[^>]*>/gi;
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            let url = match[1];
            if (url.startsWith('/')) url = `https://dailymed.nlm.nih.gov${url}`;
            if (!images.includes(url)) images.push(url);
        }
        
        return images.slice(0, 5);
    } catch (error) {
        console.error('Image fetch error:', error);
        return [];
    }
}

// ============================================================
// DENO SERVER (No external libraries)
// ============================================================

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    
    // Serve HTML
    if (url.pathname === '/') {
        return new Response(HTML, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
    
    // API: Search
    if (url.pathname === '/api/search' && req.method === 'POST') {
        try {
            const body = await req.json();
            const query = body.query || '';
            if (!query) {
                return new Response(JSON.stringify({ error: 'No query' }), { status: 400 });
            }
            const results = await searchDrug(query);
            return new Response(JSON.stringify({ results }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
    
    // API: Extract
    if (url.pathname === '/api/extract' && req.method === 'POST') {
        try {
            const body = await req.json();
            const drugUrl = body.url || '';
            if (!drugUrl) {
                return new Response(JSON.stringify({ error: 'No URL' }), { status: 400 });
            }
            
            const images = await getPackageImages(drugUrl);
            const result = {
                drug_info: { name: body.name || '', ndc: body.ndc || '' },
                label_info: { companies: [], labelers: [], ndc_codes: [], package_info: [] },
                xml: '<?xml version="1.0"?><PharmaceuticalLabel><Metadata><DrugName>' + (body.name || '') + '</DrugName></Metadata></PharmaceuticalLabel>',
                image_count: images.length,
                timestamp: new Date().toISOString()
            };
            
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
    
    return new Response('Not Found', { status: 404 });
}

// ============================================================
// START SERVER
// ============================================================

console.log('🏥 DailyMed Label Extractor');
console.log('🌐 Server running on port 8000');
console.log('💡 Try searching: Adalimumab, Humira, Lipitor');

Deno.serve({ port: 8000 }, handler);
