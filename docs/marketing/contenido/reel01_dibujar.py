from PIL import Image, ImageDraw, ImageFont
W,H=1080,1920
F='/usr/share/fonts/opentype/inter/'
def f(n,s): return ImageFont.truetype(F+n,s)
BLACK,XB,BOLD,SEMI='Inter-Black.otf','Inter-ExtraBold.otf','Inter-Bold.otf','Inter-SemiBold.otf'
RED=(224,38,47); WHITE=(238,241,247); GREY=(170,179,199); YEL=(255,206,64)
def fondo():
    im=Image.new('RGB',(W,H)); d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/H; c=tuple(int(a+(b-a)*t) for a,b in zip((40,48,68),(16,19,28)))
        d.line([(0,y),(W,y)],fill=c)
    return im
def centro(d,y,txt,font,fill=WHITE):
    w=d.textlength(txt,font=font); d.text(((W-w)/2,y),txt,font=font,fill=fill); return y+font.size*1.18
def marca(d):
    centro(d,120,'PUERTOBOX',f(BLACK,64),WHITE)
    centro(d,200,'DESPACHANTE DE ADUANA MATRICULADO',f(SEMI,28),GREY)
def pill(d,y,txt,font,bg=RED,fg=WHITE,padx=60,pady=28):
    w=d.textlength(txt,font=font); x=(W-w)/2
    d.rounded_rectangle([x-padx,y-pady,x+w+padx,y+font.size+pady*0.6],radius=60,fill=bg); d.text((x,y-6),txt,font=font,fill=fg)
def esc(nombre,dib):
    im=fondo(); d=ImageDraw.Draw(im); marca(d); dib(d); im.save(f'/home/claude/reel1/{nombre}.png')

def s1(d):
    y=560
    for t in ['¿CUÁNTO CUESTA','TRAER 100','REMERAS','DE CHINA?']:
        y=centro(d,y,t,f(BLACK,100))
    y+=40; centro(d,y,'(puestas en tu casa, todo sumado)',f(SEMI,44),GREY)
def s2(d):
    y=520; centro(d,y,'EL PEDIDO',f(XB,56),RED); y+=130
    for a,b in [('100 remeras','para revender'),('USD 300','al proveedor'),('5 kg','en 1 caja')]:
        y=centro(d,y,a,f(BLACK,110)); y=centro(d,y,b,f(SEMI,44),GREY); y+=50
def s3(d):
    y=480; centro(d,y,'LA CUENTA REAL',f(XB,56),RED); y+=130
    filas=[('Remeras','USD 300'),('Envío + gestión','USD 145'),('Impuestos (estimado)','USD 293')]
    for a,b in filas:
        d.text((110,y),a,font=f(SEMI,54),fill=WHITE); w=d.textlength(b,font=f(XB,58)); d.text((W-110-w,y-2),b,font=f(XB,58),fill=WHITE); y+=120
    d.line([(110,y),(W-110,y)],fill=GREY,width=4); y+=40
    d.text((110,y),'TOTAL',font=f(BLACK,70),fill=YEL); w=d.textlength('USD 738',font=f(BLACK,80)); d.text((W-110-w,y-6),'USD 738',font=f(BLACK,80),fill=YEL)
    y+=170; centro(d,y,'Los impuestos te los decimos',f(SEMI,42),GREY); centro(d,y+56,'ANTES de que compres',f(XB,42),WHITE)
def s4(d):
    y=560; centro(d,y,'CADA REMERA',f(BLACK,96)); y+=110; centro(d,y,'TE QUEDA EN',f(BLACK,96))
    y+=170; centro(d,y,'USD 7,38',f(BLACK,180),YEL)
    y+=300; centro(d,y,'puesta en tu casa',f(SEMI,52),WHITE); centro(d,y+70,'Ahora sabés a cuánto venderla.',f(SEMI,44),GREY)
def s5(d):
    y=560
    for t in ['MANDANOS','QUÉ QUERÉS','TRAER']:
        y=centro(d,y,t,f(BLACK,110))
    y+=40; centro(d,y,'y te calculamos el costo por unidad',f(SEMI,46),GREY); centro(d,y+62,'en minutos, gratis',f(SEMI,46),GREY)
    pill(d,y+230,'WhatsApp · link en la bio',f(XB,54))
    centro(d,H-260,'Ejemplo: caja 40×30×20 cm. Impuestos estimados, los',f(SEMI,28),GREY)
    centro(d,H-222,'confirma nuestro despachante. Precios nov. 2026.',f(SEMI,28),GREY)
for n,fn in [('s1',s1),('s2',s2),('s3',s3),('s4',s4),('s5',s5)]: esc(n,fn)
print('ok')
