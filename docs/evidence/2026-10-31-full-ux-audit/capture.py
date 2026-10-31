"""Audit capture helper. Only UI input and read-only evidence collection."""
import subprocess,sys,time,json,re,shlex,xml.etree.ElementTree as ET
from pathlib import Path
ADB=r'C:/Users/czh86/AppData/Local/Android/Sdk/platform-tools/adb.exe'
OUT=Path(__file__).parent
def adb(*args):
 if args and args[0]=='shell':args=('shell',shlex.join(args[1:]))
 return subprocess.check_output([ADB,'-s','emulator-5554',*args])
def tree():
 for attempt in range(3):
  adb('shell','rm','-f','/sdcard/audit-window.xml')
  result=adb('shell','uiautomator','dump','--compressed','/sdcard/audit-window.xml')
  if b'ERROR' not in result:
   try:return adb('shell','cat','/sdcard/audit-window.xml').decode('utf-8')
   except subprocess.CalledProcessError:pass
  time.sleep(1)
 raise RuntimeError('Fresh UI tree unavailable; refuse stale evidence')
def capture(name):
 time.sleep(.5)
 raw=tree();(OUT/(name+'.xml')).write_text(raw,encoding='utf-8')
 (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
 nodes=ET.fromstring(raw).iter('node')
 rows=[{k:n.get(k) for k in ['text','content-desc','clickable','enabled','bounds','class']} for n in nodes if n.get('text') or n.get('content-desc')]
 (OUT/(name+'.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps([{'label':r['content-desc'] or r['text'],'enabled':r['enabled'],'bounds':r['bounds']} for r in rows if r['clickable']=='true' or (r['text'] and not r['content-desc'])],ensure_ascii=False))
cmd=sys.argv[1]
if cmd=='capture':capture(sys.argv[2])
elif cmd=='tap':
 raw=tree();root=ET.fromstring(raw);parents={c:p for p in root.iter() for c in p};nodes=[n for n in root.iter('node') if n.get('clickable')=='true' and sys.argv[2] in [n.get('text'),n.get('content-desc')]]
 if not nodes:
  for n in root.iter('node'):
   if sys.argv[2] in [n.get('text'),n.get('content-desc')]:
    while n in parents and n.get('clickable')!='true':n=parents[n]
    if n.get('clickable')=='true':nodes.append(n)
 if not nodes:raise SystemExit('TARGET MISSING: '+sys.argv[2])
 n=nodes[int(sys.argv[3]) if len(sys.argv)>3 else 0];x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
 print(n.attrib);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
elif cmd=='back':adb('shell','input','keyevent','4')
elif cmd=='tapbounds':
 raw=tree();n=next(n for n in ET.fromstring(raw).iter('node') if n.get('clickable')=='true' and n.get('bounds')==sys.argv[2])
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
 print(n.attrib);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
elif cmd=='text':adb('shell','input','text',sys.argv[2])
elif cmd=='open':adb('shell','am','start','-a','android.intent.action.VIEW','-d','autodlh3:///'+sys.argv[2],'com.example.autodlh3')
elif cmd=='swipe':adb('shell','input','swipe','540','1700','540','600','400')



