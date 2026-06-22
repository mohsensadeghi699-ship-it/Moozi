// ============================================================
// DAILYMED LABEL EXTRACTOR - DENO DEPLOY VERSION (FIXED)
// Deploy this to https://deno.com/deploy
// ============================================================

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// ============================================================
// DATA CLASSES
// ============================================================

interface DrugInfo {
  name: string;
  ndc: string;
  manufacturer: string;
  category: string;
  url: string;
}

interface LabelInfo {
  companies: string[];
  labelers: string[];
  ndc_codes: string[];
  package_info: string[];
}

// ============================================================
// DAILYMED SEARCHER
// ============================================================

class DailyMedSearcher {
  private baseUrl = "https://dailymed.nlm.nih.gov";
  
  async searchDrug(drugName: string, maxResults: number = 20): Promise<DrugInfo[]> {
    console.log(`Searching for: ${drugName}`);
    
    try {
      const searchUrl = `https://dailymed.nlm.nih.gov/dailymed/search.cfm?q=${drugName}&searchtype=select`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const results: DrugInfo[] = [];
      
      $('a[href*="drugInfo.cfm?setid="]').each((index: number, element: any) => {
        if (index >= maxResults) return false;
        
        const href = $(element).attr('href') || '';
        let name = $(element).text().trim();
        name = name.replace(/LABEL:|label:/g, '').trim();
        
        if (name && href) {
          let url = href;
          if (href.startsWith('/')) {
            url = `https://dailymed.nlm.nih.gov${href}`;
          }
          
          let ndc = '';
          const parentText = $(element).parent().text();
          const ndcMatch = parentText.match(/\b(\d{5}-\d{3}-\d{2})\b/);
          if (ndcMatch) {
            ndc = ndcMatch[1];
          }
          
          results.push({
            name: name,
            ndc: ndc,
            manufacturer: '',
            category: '',
            url: url
          });
        }
      });
      
      console.log(`Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`Search error: ${error}`);
      return [];
    }
  }
  
  async getPackageImages(drugUrl: string): Promise<string[]> {
    try {
      console.log(`Fetching images from: ${drugUrl}`);
      const response = await fetch(drugUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const imageUrls: string[] = [];
      
      $('img').each((index: number, element: any) => {
        const src = $(element).attr('src') || '';
        if (src && (src.toLowerCase().includes('package') || src.toLowerCase().includes('label'))) {
          let fullUrl = src;
          if (src.startsWith('/')) {
            fullUrl = `https://dailymed.nlm.nih.gov${src}`;
          }
          if (!imageUrls.includes(fullUrl)) {
            imageUrls.push(fullUrl);
          }
        }
      });
      
      $('a[href*="package"]').each((index: number, element: any) => {
        const href = $(element).attr('href') || '';
        if (href && (href.endsWith('.jpg') || href.endsWith('.png') || href.endsWith('.jpeg'))) {
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://dailymed.nlm.nih.gov${href}`;
          }
          if (!imageUrls.includes(fullUrl)) {
            imageUrls.push(fullUrl);
          }
        }
      });
      
      console.log(`Found ${imageUrls.length} images`);
      return imageUrls.slice(0, 5);
    } catch (error) {
      console.error(`Image fetch error: ${error}`);
      return [];
    }
  }
}

// ============================================================
// LABEL EXTRACTOR
// ============================================================

class PharmaLabelExtractor {
  // ============================================================
  // ADD YOUR KEYWORDS HERE
  // ============================================================
  private companyKeywords = [
    'pharma', 'pharmaceutical', 'labs', 'inc', 'corp', 'llc', 'ltd',
    'biologics', 'biosciences', 'therapeutics', 'medicines', 'healthcare',
    'genentech', 'pfizer', 'merck', 'novartis', 'roche', 'sanofi',
    'astrazeneca', 'glaxosmithkline', 'johnson', 'janssen', 'amgen',
    'abbvie', 'bristol', 'squibb', 'eli lilly', 'bayer', 'novo nordisk',
    'teva', 'mylan', 'sandoz', 'apotex', 'dr reddy', 'cipla',
    'quallent',
  ];
  
  private labelerKeywords = [
    'manufacturer', 'distributor', 'packager', 'labeler',
    'marketed by', 'distributed by', 'manufactured by'
  ];
  
  async extractTextFromImage(imageUrl: string): Promise<string[]> {
    try {
      console.log(`Attempting to extract text from: ${imageUrl}`);
      return [`Package image: ${imageUrl.split('/').pop()}`];
    } catch (error) {
      console.error(`OCR error: ${error}`);
      return [];
    }
  }
  
  extractLabelInfo(textLines: string[]): LabelInfo {
    const labelInfo: LabelInfo = {
      companies: [],
      labelers: [],
      ndc_codes: [],
      package_info: []
    };
    
    const fullText = textLines.join(' ');
    
    const ndcMatches = fullText.matchAll(/\b(\d{5}-\d{3}-\d{2})\b/g);
    for (const match of ndcMatches) {
      labelInfo.ndc_codes.push(match[1]);
    }
    
    for (const keyword of this.companyKeywords) {
      if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
        const pattern = new RegExp(`([A-Z][a-zA-Z\\s,\\.&]+(?:${keyword}))`, 'gi');
        const matches = fullText.matchAll(pattern);
        for (const match of matches) {
          const company = match[1].trim();
          if (company.length > 3 && !labelInfo.companies.includes(company)) {
            labelInfo.companies.push(company);
          }
        }
      }
    }
    
    for (const keyword of this.labelerKeywords) {
      if (fullText.toLowerCase().includes(keyword.toLowerCase())) {
        const pattern = new RegExp(`(?:${keyword})\\s*:?\\s*([A-Z][a-zA-Z\\s,\\.&]+)`, 'gi');
        const matches = fullText.matchAll(pattern);
        for (const match of matches) {
          const labeler = match[1].trim();
          if (labeler.length > 3 && !labelInfo.labelers.includes(labeler)) {
            labelInfo.labelers.push(labeler);
          }
        }
      }
    }
    
    const packageMatch = fullText.match(/Package:\s*([^\n]+)/);
    if (packageMatch) {
      labelInfo.package_info.push(packageMatch[1].trim());
    }
    
    return labelInfo;
  }
  
  createXML(drugInfo: DrugInfo, labelInfo: LabelInfo): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<PharmaceuticalLabel>\n';
    xml += '  <Metadata>\n';
    xml += `    <ExtractionDate>${new Date().toISOString()}</ExtractionDate>\n`;
    xml += `    <DrugName>${this.escapeXML(drugInfo.name)}</DrugName>\n`;
    xml += `    <NDC>${this.escapeXML(drugInfo.ndc)}</NDC>\n`;
    xml += '  </Metadata>\n';
    xml += '  <LabelInformation>\n';
    
    if (labelInfo.companies.length > 0) {
      xml += '    <Companies>\n';
      for (const company of labelInfo.companies) {
        xml += `      <Company>${this.escapeXML(company)}</Company>\n`;
      }
      xml += '    </Companies>\n';
    }
    
    if (labelInfo.labelers.length > 0) {
      xml += '    <Labelers>\n';
      for (const labeler of labelInfo.labelers) {
        xml += `      <Labeler>${this.escapeXML(labeler)}</Labeler>\n`;
      }
      xml += '    </Labelers>\n';
    }
    
    if (labelInfo.ndc_codes.length > 0) {
      xml += '    <NDCCodes>\n';
      for (const code of labelInfo.ndc_codes) {
        xml += `      <Code>${this.escapeXML(code)}</Code>\n`;
      }
      xml += '    </NDCCodes>\n';
    }
    
    if (labelInfo.package_info.length > 0) {
      xml += '    <PackageInformation>\n';
      for (const info of labelInfo.package_info) {
        xml += `      <Info>${this.escapeXML(info)}</Info>\n`;
      }
      xml += '    </PackageInformation>\n';
    }
    
    xml += '  </LabelInformation>\n';
    xml += '</PharmaceuticalLabel>';
    
    return xml;
  }
  
  escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  async processDrug(drugInfo: DrugInfo, imageUrls: string[]): Promise<any> {
    console.log(`Processing: ${drugInfo.name}`);
    
    const allText: string[] = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      console.log(`  Processing image ${i + 1}/${imageUrls.length}`);
      const textLines = await this.extractTextFromImage(imageUrls[i]);
      allText.push(...textLines);
    }
    
    const labelInfo = this.extractLabelInfo(allText);
    const xmlContent = this.createXML(drugInfo, labelInfo);
    
    return {
      drug_info: drugInfo,
      label_info: labelInfo,
      xml: xmlContent,
      image_count: imageUrls.length,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================
// HTML TEMPLATE - FIXED VERSION
// ============================================================

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DailyMed Label Extractor</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;min-height:100vh}
        .container{max-width:1200px;margin:0 auto;background:white;border-radius:20px;padding:30px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
        h1{color:#333;margin-bottom:5px}
        .subtitle{color:#666;margin-bottom:20px}
        .search-box{display:flex;gap:10px;margin-bottom:20px}
        .search-box input{flex:1;padding:12px 20px;border:2px solid #ddd;border-radius:8px;font-size:16px}
        .search-box button{padding:12px 30px;background:#667eea;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px}
        .search-box button:hover{background:#5a67d8}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
        .panel{background:#f8f9fa;border-radius:12px;padding:15px;min-height:300px}
        .panel h3{border-bottom:2px solid #667eea;padding-bottom:10px;margin-bottom:15px}
        .result-item{background:white;padding:12px 15px;border-radius:8px;margin-bottom:8px;cursor:pointer;border:2px solid transparent}
        .result-item:hover{border-color:#667eea;transform:translateX(5px)}
        .result-item .name{font-weight:bold}
        .result-item .meta{font-size:12px;color:#888;margin-top:4px}
        .xml-box{background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;font-family:monospace;font-size:12px;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word}
        .status-bar{margin-top:20px;padding:15px;background:#e8f5e9;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
        .status-bar button{padding:8px 20px;background:#667eea;color:#fff;border:none;border-radius:6px;cursor:pointer}
        .tag{display:inline-block;padding:4px 12px;border-radius:16px;font-size:12px;margin:3px}
        .tag.company{background:#e3f2fd;color:#1565c0}
        .tag.labeler{background:#f3e5f5;color:#7b1fa2}
        .tag.ndc{background:#fff3e0;color:#e65100}
        .loading{display:inline-block;width:20px;height:20px;border:3px solid #f3f3f3;border-top:3px solid #667eea;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        @media(max-width:768px){.grid{grid-template-columns:1fr}}
    </style>
</head>
<body>
<div class="container">
<h1>🏥 DailyMed Label Extractor</h1>
<div class="subtitle">Search drugs and extract label information</div>
<div class="search-box">
<input type="text" id="searchInput" placeholder="Enter drug name (e.g., Adalimumab, Humira)" />
<button onclick="searchDrug()">🔍 Search</button>
<button onclick="clearAll()" style="background:#ef5350;">Clear</button>
</div>
<div class="grid">
<div class="panel"><h3>📋 Results</h3><div id="resultsList"><div style="color:#999;text-align:center;padding:40px 0;">Search for a drug</div></div></div>
<div class="panel"><h3>📊 Extracted Info</h3><div id="infoPanel"><div style="color:#999;text-align:center;padding:40px 0;">Select a result</div></div></div>
</div>
<div class="panel" style="margin-top:20px;"><h3>📄 XML Output</h3><div id="xmlPreview" class="xml-box"><span style="color:#666;">XML will appear here</span></div></div>
<div class="status-bar"><div id="statusMessage">Ready</div><div><button onclick="downloadXML()">💾 Download</button><button onclick="copyXML()" style="margin-left:10px;">📋 Copy</button></div></div>
</div>
<script>
let currentResults=[],currentXML='',currentDrug=null;
function searchDrug(){const q=document.getElementById('searchInput').value.trim();if(!q)return alert('Enter a drug name');const btn=document.querySelector('.search-box button');btn.innerHTML='<span class="loading"></span>';document.getElementById('statusMessage').textContent='Searching...';fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})}).then(r=>r.json()).then(d=>{currentResults=d.results||[];displayResults(currentResults);document.getElementById('statusMessage').textContent='Found '+currentResults.length+' results';btn.innerHTML='🔍 Search';}).catch(err=>{alert('Error: '+err.message);btn.innerHTML='🔍 Search';});}
function displayResults(results){const c=document.getElementById('resultsList');if(!results||!results.length){c.innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">No results</div>';return;}c.innerHTML=results.map((d,i)=>'<div class="result-item" onclick="selectDrug('+i+')"><div class="name">'+d.name+'</div><div class="meta">NDC: '+(d.ndc||'N/A')+'</div></div>').join('');}
function selectDrug(index){const drug=currentResults[index];if(!drug)return;document.getElementById('statusMessage').textContent='Processing '+drug.name+'...';document.getElementById('infoPanel').innerHTML='<div style="text-align:center;padding:40px 0;"><span class="loading"></span> Extracting...</div>';fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(drug)}).then(r=>r.json()).then(d=>{if(d.error)throw new Error(d.error);currentXML=d.xml;currentDrug=d.drug_info;displayInfo(d);document.getElementById('xmlPreview').textContent=d.xml;document.getElementById('statusMessage').textContent='Complete!';}).catch(err=>{document.getElementById('infoPanel').innerHTML='<div style="color:red;padding:20px;">Error: '+err.message+'</div>';document.getElementById('statusMessage').textContent='Error';});}
function displayInfo(d){const info=d.label_info||{};let h='<div style="margin-bottom:15px;"><strong>'+d.drug_info.name+'</strong></div>';if(info.companies?.length){h+='<div><b>🏢 Companies:</b><br>'+info.companies.map(c=>'<span class="tag company">'+c+'</span>').join('')+'</div><br>';}if(info.labelers?.length){h+='<div><b>📦 Labelers:</b><br>'+info.labelers.map(l=>'<span class="tag labeler">'+l+'</span>').join('')+'</div><br>';}if(info.ndc_codes?.length){h+='<div><b>🔢 NDC Codes:</b><br>'+info.ndc_codes.map(n=>'<span class="tag ndc">'+n+'</span>').join('')+'</div><br>';}if(info.package_info?.length){h+='<div><b>📦 Package:</b><br>'+info.package_info.join('<br>')+'</div><br>';}h+='<div style="font-size:12px;color:#999;">Images: '+d.image_count+'</div>';document.getElementById('infoPanel').innerHTML=h;}
function downloadXML(){if(!currentXML)return alert('No XML to download');const b=new Blob([currentXML],{type:'application/xml'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(currentDrug?.name||'label')+'.xml';a.click();}
function copyXML(){if(!currentXML)return alert('No XML to copy');navigator.clipboard.writeText(currentXML).then(()=>{document.getElementById('statusMessage').textContent='Copied!';setTimeout(()=>document.getElementById('statusMessage').textContent='Ready',2000);});}
function clearAll(){currentResults=[];currentXML='';currentDrug=null;document.getElementById('resultsList').innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">Search for a drug</div>';document.getElementById('infoPanel').innerHTML='<div style="color:#999;text-align:center;padding:40px 0;">Select a result</div>';document.getElementById('xmlPreview').textContent='XML will appear here';document.getElementById('statusMessage').textContent='Ready';}
document.getElementById('searchInput').addEventListener('keypress',e=>{if(e.key==='Enter')searchDrug();});
</script>
</body>
</html>
`;

// ============================================================
// MAIN APPLICATION
// ============================================================

const app = new Application();
const router = new Router();

const searcher = new DailyMedSearcher();
const extractor = new PharmaLabelExtractor();

// Routes
router.get('/', (ctx) => {
  ctx.response.body = HTML_TEMPLATE;
  ctx.response.headers.set('Content-Type', 'text/html');
});

router.post('/api/search', async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const query = body.query || '';
    
    if (!query) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'No query provided' };
      return;
    }
    
    const results = await searcher.searchDrug(query);
    ctx.response.body = { results };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

router.post('/api/extract', async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const drugInfo: DrugInfo = {
      name: body.name || '',
      ndc: body.ndc || '',
      manufacturer: body.manufacturer || '',
      category: body.category || '',
      url: body.url || ''
    };
    
    if (!drugInfo.url) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'No URL provided' };
      return;
    }
    
    const images = await searcher.getPackageImages(drugInfo.url);
    
    if (!images || images.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'No images found' };
      return;
    }
    
    const result = await extractor.processDrug(drugInfo, images);
    ctx.response.body = result;
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// Enable CORS
app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

// ============================================================
// START SERVER
// ============================================================

console.log("=".repeat(60));
console.log("🏥 DailyMed Label Extractor - Deno Deploy");
console.log("=".repeat(60));
console.log("🌐 Server running on port 8000");
console.log("=".repeat(60));
console.log("💡 Try searching: Adalimumab, Humira, Lipitor");
console.log("=".repeat(60));

await app.listen({ port: 8000 });
