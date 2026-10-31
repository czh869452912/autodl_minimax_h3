"""Verify this documentation package, not product functionality."""
from pathlib import Path
import json, re, hashlib
from PIL import Image, ImageDraw, ImageFont

OUT=Path(__file__).parent
ROOT=OUT.parents[2]
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
assert len(manifest['captures'])==66
for item in manifest['captures']:
    for name,want in item['sha256'].items():
        assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==want,name
    with Image.open(OUT/item['png']) as im:
        assert list(im.size)==item['dimensions']
        im.verify()
    if item['treeAccepted']:
        assert item['xml'] and item['status'] in ('accepted','system-input')
assert not next(i for i in manifest['captures'] if i['id']=='25')['treeAccepted']
controls=json.loads((OUT/'ui-controls.json').read_text(encoding='utf-8'))
assert len({c['id'] for c in controls})==len(controls)==664
for name in ['source-controls.json','source-navigation.json','source-routes.json','findings.json','transitions.json','baseline.json']:
    data=json.loads((OUT/name).read_text(encoding='utf-8'))
    if name.startswith('source-'):
        for row in data:
            file=ROOT/row['file']
            assert file.is_file(),file
            assert 0<row['line']<=len(file.read_text(encoding='utf-8').splitlines()),row
findings=json.loads((OUT/'findings.json').read_text(encoding='utf-8'))
assert len(findings)==14
assert {x['id'] for x in findings}=={f'F{i:02}' for i in range(1,15)}
checked_links=0
docs=list(OUT.glob('*.md'))+[ROOT/'docs/reviews/2026-10-31-full-product-ux-audit.md',ROOT/'docs/reviews/2026-10-31-ux-execution-handoff.md']
for file in docs:
    content=re.sub(r'```.*?```','',file.read_text(encoding='utf-8'),flags=re.S)
    for ref in re.findall(r'!?\[[^\]\n]*\]\(([^)\n]+)\)',content):
        if re.match(r'https?://|#|mailto:',ref):continue
        target=ref.split('#')[0]
        assert (file.parent/target).exists(),(file,ref)
        checked_links+=1
page=(OUT/'evidence.html').read_text(encoding='utf-8')
for ref in re.findall(r'(?:href|src)="([^"$]+)"',page):
    if ref.startswith(('http','#')):continue
    assert (OUT/ref).exists(),ref

# Selected originals, scaled uniformly; labels outside screenshots.
sheet=Image.new('RGB',(1400,890),'#e9efec')
d=ImageDraw.Draw(sheet)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',21)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',17)
examples=[('19','空镜头：直接选材'),('57','开草稿返回：选材退入更多'),('21','空选择器：缺导入/生成出口'),('55','素材处理：多层Sheet保留')]
for col,(ident,caption) in enumerate(examples):
    item=next(i for i in manifest['captures'] if i['id']==ident)
    im=Image.open(OUT/item['png']).convert('RGB');im.thumbnail((334,760))
    x=col*350+(350-im.width)//2
    d.text((col*350+10,12),f'{ident} · {caption}',font=small,fill='#183e32')
    sheet.paste(im,(x,48))
d.text((18,830),'本轮Android原图缩览；完整分辨率、操作轨迹与边界说明见证据浏览器。',font=font,fill='#183e32')
sheet.save(OUT/'audit-highlights.jpg',quality=92)
result=dict(check='documentation integrity, not product tests',passed=True,captures=66,uiNodeInstances=len(controls),findings=len(findings),checkedLocalMarkdownLinks=checked_links,
            assertions=['PNG dimensions and decoding','original file SHA256','source file/line presence','unique node IDs','14 finding IDs','local artifact links','25 stale XML rejected'],
            productTestsRun=False,productImplementationChanged=False)
(OUT/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
