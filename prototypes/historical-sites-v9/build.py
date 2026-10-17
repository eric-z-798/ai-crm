from pathlib import Path
import re,json,argparse
parser=argparse.ArgumentParser();parser.add_argument("--base-path",default="");args=parser.parse_args();base=args.base_path.rstrip("/");assert not base or re.fullmatch(r"/[a-z0-9-]+",base)
root=Path(__file__).resolve().parent
html=(root/'src/index.html').read_text();css=(root/'src/style.css').read_text()
catalogs={lang:json.loads((root/f'src/locales/{lang}.json').read_text()) for lang in ['zh-CN','en']}
assert set(catalogs['zh-CN'])==set(catalogs['en']), 'Locale key mismatch'
for key, zh in catalogs['zh-CN'].items():
    en=catalogs['en'][key]
    assert isinstance(en,str) and en.strip(), f'Missing English value: {key}'
    assert sorted(re.findall(r'\{(\w+)\}',zh))==sorted(re.findall(r'\{(\w+)\}',en)), f'Parameter mismatch: {key}'
terms=json.loads((root/'src/terms.json').read_text())
strip=lambda text:re.sub(r'\bexport\s+(?=(?:const|class|function)\b)','',text)
i18n=strip((root/'src/i18n.mjs').read_text()).replace('/*__CATALOGS__*/{}',json.dumps(catalogs,ensure_ascii=False)).replace('/*__TERMS__*/{}',json.dumps(terms,ensure_ascii=False))
domain=strip((root/'src/domain.mjs').read_text())
seed=strip((root/'src/presentation-seed.mjs').read_text())
presentation=re.sub(r'^import .*?;\n','',strip((root/'src/presentation.mjs').read_text()),flags=re.M)
core=(root/'src/configurable-core.mjs').read_text()
configui=(root/'src/configurable-ui.mjs').read_text()
app=re.sub(r"^import .* from './(?:domain|i18n|day|day-data).mjs';\n",'',(root/'src/app.mjs').read_text(),flags=re.M)
data=strip((root/'src/day-data.mjs').read_text())
day=re.sub(r"^import .* from './(?:domain|day-data).mjs';\n",'',strip((root/'src/day.mjs').read_text()),flags=re.M)
dayui=(root/'src/day-ui.mjs').read_text()
extensions='\n'.join((root/'src'/name).read_text() for name in ['workspace-ui.mjs','navigator-ui.mjs'] if (root/'src'/name).exists())
script="(()=>{'use strict';\n"+i18n+'\n'+domain+'\n'+data+'\n'+day+'\n'+seed+'\n'+presentation+'\n'+core+'\n'+app+'\n'+dayui+'\n'+configui+'\n'+extensions+'\n})();'
assert '</script' not in script.lower()
# Hosted assets are external so strict CSP never requires inline execution.
css += '\n#durable-background-status{position:fixed;right:16px;bottom:16px;z-index:10000;padding:8px 12px;background:#EEF2FC;color:#18202E;border:1px solid #ccd4ef;border-radius:8px;pointer-events:none;font-size:14px}#durable-background-status[hidden]{display:none}#durable-save-blocker{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;border-radius:0;background:#F5F6F8;color:#18202E;padding:clamp(24px,8vw,96px);box-sizing:border-box}#durable-save-blocker::backdrop{background:#F5F6F8}#durable-save-blocker button{margin:12px;padding:12px;min-height:44px;background:#3855B5;color:white;border:0;border-radius:8px}#durable-save-blocker button[hidden]{display:none}'
output=html.replace('<style>/*__STYLE__*/</style>','<link rel="stylesheet" href="/style.css">').replace('<script>/*__SCRIPT__*/</script>','<script type="module" src="/app.js"></script>')
bootstrap="import {installDurableStorage} from '"+base+"/durable-storage.mjs';\nconst ready=await installDurableStorage(window,document,"+json.dumps({'apiUrl':base+'/api','journalPrefix':base+'/' if base else ''})+");\nif(ready){\n"+script+'\n}'
output=output.replace('href="/style.css"','href="'+base+'/style.css"').replace('src="/app.js"','src="'+base+'/app.js"')
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(output)
(root/'dist/app.js').write_text(bootstrap)
(root/'dist/style.css').write_text(css)
(root/'dist/durable-storage.mjs').write_text((root/'durable-storage.mjs').read_text())
assets={name:(root/'dist'/name).read_text() for name in ['index.html','app.js','style.css','durable-storage.mjs']}
(root/'static-assets.mjs').write_text('export const assets = '+json.dumps(assets,ensure_ascii=False)+';\n')
print(f'Built {len(output.encode())} HTML bytes; external JS/CSS with durable bootstrap')
