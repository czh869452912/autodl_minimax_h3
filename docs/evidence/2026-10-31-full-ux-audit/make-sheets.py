from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).parent
files=sorted(p.glob('[0-9]*.png'))
for offset in range(0,len(files),8):
 group=files[offset:offset+8];sheet=Image.new('RGB',(1200,1430),'#dddddd');d=ImageDraw.Draw(sheet)
 for i,f in enumerate(group):
  im=Image.open(f).convert('RGB');im.thumbnail((290,660));x=(i%4)*300;y=(i//4)*715
  sheet.paste(im,(x,y+30));d.text((x+4,y+6),f.stem,fill='black')
 sheet.save(p/f'contact-{offset//8+1:02}.jpg')
 print(p/f'contact-{offset//8+1:02}.jpg')
