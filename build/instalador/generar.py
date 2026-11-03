#!/usr/bin/env python3
"""Genera los recursos de los instaladores a partir de terminos.md y de la imagen de inicio.
   Windows (NSIS): licencia.txt, barra lateral 164x314 (BMP) y encabezado 150x57 (BMP).
   Mac (.pkg):     welcome.html, license.html, conclusion.html, background.png (y @2x).
Uso: python3 build/instalador/generar.py VERSION"""
import html, os, re, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

V = sys.argv[1] if len(sys.argv) > 1 else '0.0.0'
D = os.path.dirname(os.path.abspath(__file__)); P = os.path.dirname(os.path.dirname(D))
OUT = os.path.join(D, 'gen'); os.makedirs(OUT, exist_ok=True)
md = open(os.path.join(D, 'terminos.md'), encoding='utf-8').read()

# ---------- licencia.txt (NSIS muestra texto plano: UTF-8 con BOM y CRLF)
def plain(md):
    out = []
    for ln in md.splitlines():
        if ln.startswith('# '): out += [ln[2:].upper(), '']
        elif ln.startswith('## '): out += ['', ln[3:].upper()]
        elif ln.startswith('- '): out.append('  • ' + ln[2:])
        else: out.append(ln)
    t = '\n'.join(out).replace('**', '')
    return re.sub(r'\n{3,}', '\n\n', t).strip() + '\n'
open(os.path.join(OUT, 'licencia.txt'), 'w', encoding='utf-8-sig', newline='\r\n').write(plain(md))

# ---------- HTML para el instalador de Mac
CSS = """<style>body{font:13px/1.55 -apple-system,'Helvetica Neue',Arial,sans-serif;color:#1d2433;margin:0 10px 0 6px}
p,li{text-align:justify;hyphens:auto;-webkit-hyphens:auto}h1,h2{text-align:left}
h1{font-size:19px;margin:0 0 10px;color:#14204a}h2{font-size:13.5px;margin:16px 0 4px;color:#14204a}p{margin:0 0 9px}
ul{margin:0 0 9px;padding-left:20px}li{margin:2px 0}.muted{color:#5b6478}.box{background:#f2f5fc;border-radius:10px;padding:10px 12px;margin:12px 0}
@media (prefers-color-scheme:dark){body{color:#e6e9f2}h1,h2{color:#c9d4ff}.muted{color:#a3abc0}.box{background:#232a3d}}</style>"""
def md2html(md):
    out = []; ul = False
    for ln in md.splitlines():
        if ln.startswith('- '):
            if not ul: out.append('<ul>'); ul = True
            out.append('<li>' + html.escape(ln[2:]) + '</li>'); continue
        if ul: out.append('</ul>'); ul = False
        if ln.startswith('# '): out.append('<h1>' + html.escape(ln[2:]) + '</h1>')
        elif ln.startswith('## '): out.append('<h2>' + html.escape(ln[3:]) + '</h2>')
        elif ln.strip(): out.append('<p>' + html.escape(ln) + '</p>')
    if ul: out.append('</ul>')
    return '\n'.join(out)
page = lambda body: f'<!doctype html><html lang="es"><head><meta charset="utf-8">{CSS}</head><body>{body}</body></html>'
open(os.path.join(OUT, 'license.html'), 'w', encoding='utf-8').write(page(md2html(md)))
open(os.path.join(OUT, 'welcome.html'), 'w', encoding='utf-8').write(page(f"""
<h1>Bienvenido a PortalFirma Asset {V}</h1>
<p>Este asistente instalará PortalFirma Asset en la carpeta <b>Aplicaciones</b> de tu Mac.</p>
<p>Con PortalFirma Asset puedes:</p>
<ul><li>administrar tu cartera de propiedades y tu CRM de personas con RUT único;</li>
<li>llevar cada venta y arriendo por etapas, con firmas que hacen avanzar el negocio solo;</li>
<li>publicar en Portal Inmobiliario y recibir a los interesados en la ficha;</li>
<li>enviar a firmar, usar la Notaría virtual y gestionar firmas presenciales ante notario;</li>
<li>pedirle todo al Agente por chat: documentos desde tus plantillas, visitas, negocios y seguimiento de firmas.</li></ul>
<div class="box">Si ya tienes una versión anterior, se reemplazará. Tu cartera, tus negocios y tu configuración se conservan.</div>
<p class="muted">Requiere macOS 11 (Big Sur) o posterior. Funciona en Mac con Apple Silicon e Intel. Presiona <b>Continuar</b> para leer los términos y condiciones.</p>"""))
open(os.path.join(OUT, 'conclusion.html'), 'w', encoding='utf-8').write(page(f"""
<h1>PortalFirma Asset quedó instalado</h1>
<p>Encontrarás <b>PortalFirma Asset</b> en la carpeta Aplicaciones y en el Launchpad.</p>
<div class="box"><b>Primeros pasos</b><ul><li>Inicia sesión con tu cuenta de Portalfirma.</li>
<li>En el Inicio, pulsa <b>Importar desde Portalfirma</b> para traer tu cartera.</li>
<li>Pulsa <b>Aprende a usarla</b> para recorrer la app panel por panel.</li></ul></div>
<p class="muted">Versión {V} · www.portalfirma.cl</p>"""))

# ---------- imágenes
foto = Image.open(os.path.join(P, 'src/renderer/img/inicio-propiedades.jpg')).convert('RGB')
logo = Image.open(os.path.join(P, 'src/renderer/assets/logo.png')).convert('RGBA')
icono = Image.open(os.path.join(P, 'build/icon.png')).convert('RGBA')
F = lambda s, b=False: ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-' + ('Bold' if b else 'Regular') + '.ttf', s)
def cover(im, w, h, cx=.5, cy=.45):
    r = max(w / im.width, h / im.height); im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = round((im.width - w) * cx); y = round((im.height - h) * cy); return im.crop((x, y, x + w, y + h))
def gradient(w, h, top, bottom):
    g = Image.new('RGBA', (w, h)); d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1); d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4)))
    return g
def lateral(w, h, k=1):
    im = cover(foto, w, h, .55, .5).convert('RGBA')
    im = Image.alpha_composite(im, gradient(w, h, (20, 32, 90, 70), (16, 26, 74, 236)))
    ic = icono.resize((round(64 * k), round(64 * k)), Image.LANCZOS); im.alpha_composite(ic, (round(18 * k), round(h - 150 * k)))
    d = ImageDraw.Draw(im); d.text((round(18 * k), round(h - 78 * k)), 'PortalFirma', font=F(round(21 * k), True), fill='white')
    d.text((round(18 * k), round(h - 54 * k)), 'Asset', font=F(round(21 * k)), fill=(205, 216, 255))
    d.text((round(18 * k), round(h - 26 * k)), f'Versión {V}', font=F(round(11 * k)), fill=(185, 196, 230))
    return im
# NSIS: barra lateral de bienvenida y fin (164x314) y encabezado (150x57), BMP de 24 bits
lateral(164, 314).convert('RGB').save(os.path.join(OUT, 'sidebar.bmp'))
hdr = Image.new('RGB', (150, 57), 'white'); lg = logo.copy(); lg.thumbnail((128, 40), Image.LANCZOS)
hdr.paste(lg, (150 - lg.width - 8, (57 - lg.height) // 2), lg); hdr.save(os.path.join(OUT, 'header.bmp'))
# Mac: fondo de la columna de pasos (abajo a la izquierda), 1x y 2x
for k, n in ((1, 'background.png'), (2, 'background@2x.png')):
    w, h = 190 * k, 178 * k  # más bajo: la imagen empieza bajo la lista de pasos y no tapa su texto
    im = lateral(w, h, k)
    mask = gradient(w, h, (0, 0, 0, 0), (0, 0, 0, 255)).split()[3].point(lambda a: min(255, a * 4))
    im.putalpha(mask); im.save(os.path.join(OUT, n))
print('ok', OUT)
