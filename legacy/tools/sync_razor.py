import sys
if '--force' not in sys.argv:
    sys.exit("AVISO: este script sobrescreve as Views Razor reais com o protótipo antigo. Use --force se tiver mesmo a certeza.")
from pathlib import Path
import json, re, shutil
root=Path(__file__).resolve().parent.parent.parent; proto=root/'legacy'/'prototype-html';mvc=root/'aspnet-mvc-starter'
html=(proto/'index.html').read_text()
head=html.split('<head>',1)[1].split('</head>',1)[0]
body=html.split('<body>',1)[1].split('</body>',1)[0]
body=body.split('  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>')[0]
# split nine sibling page sections into individual Razor partials
names={'inicio':'Inicio','dashboard':'Dashboard','mapa':'Mapa','temporal':'Temporal','recomendacoes':'Recomendacoes','modelos':'Modelos','dados':'Dados','historico':'Historico','api':'Api'}
for key,name in names.items():
 p=re.compile(r'          <section class="app-view[^>]*data-view="'+key+r'"[^>]*>.*?</section>',re.S)
 m=p.search(body)
 if not m: raise RuntimeError('missing view '+key)
 (mvc/'Views/Observatorio'/('_'+name+'.cshtml')).write_text(m.group(0).strip()+'\n')
 body=body[:m.start()]+f'          <partial name="~/Views/Observatorio/_{name}.cshtml" />'+body[m.end():]
body=body.replace('href="login.html"','href="/Account/Login"').replace('href="registo.html"','href="/Account/Register"')
(mvc/'Views/Home/Index.cshtml').write_text('@{ ViewData["Title"] = "TERRA.SINAL | Grupo 03"; }\n'+body.strip()+'\n')
head=head.replace('href="assets/img/favicon.svg"','href="~/assets/img/favicon.svg"').replace('href="assets/css/style.css"','href="~/assets/css/style.css"')
(mvc/'Views/Shared/_Layout.cshtml').write_text('''<!doctype html>
<html lang="pt-MZ">
<head>'''+head+'''</head>
<body>
@RenderBody()
<script>window.TERRA_CONFIG = { useApi: true, baseUrl: '/api' };</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="~/assets/js/mock-data.js" asp-append-version="true"></script>
<script src="~/assets/js/api-client.js" asp-append-version="true"></script>
<script src="~/assets/js/app.js" asp-append-version="true"></script>
</body>
</html>
''')
(mvc/'Views/_ViewStart.cshtml').write_text('@{ Layout = "_Layout"; }\n')
(mvc/'Views/_ViewImports.cshtml').write_text('@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers\n')
for folder in ['css','js','img']:
 d=mvc/'wwwroot/assets'/folder;d.mkdir(parents=True,exist_ok=True)
 for f in (proto/'assets'/folder).iterdir():shutil.copy2(f,d/f.name)
# extract data literals via node using a JS vm sandbox (or parse with quick `node` step separately)

# Visual de Login/Registo pronto para ligação futura ao ASP.NET Core Identity.
(mvc/'Views/Account').mkdir(exist_ok=True)
for filename, action in [('login.html','Login'),('registo.html','Register')]:
    auth=(proto/filename).read_text().split('<body>',1)[1].split('</body>',1)[0]
    auth=auth.replace('href="index.html#dashboard"','href="/#dashboard"')
    auth=auth.replace('href="registo.html"','href="/Account/Register"').replace('href="login.html"','href="/Account/Login"')
    (mvc/'Views/Account'/(action+'.cshtml')).write_text('@{ ViewData["Title"] = "'+action+' · TERRA.SINAL"; }\n'+auth+'\n')
