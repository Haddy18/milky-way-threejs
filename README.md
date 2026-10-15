# Vía Láctea · Three.js

Vuelo libre por la Vía Láctea a escala real: **119.626 estrellas con posiciones
reales** del catálogo [HYG](https://github.com/astronexus/HYG-Database) (Hipparcos,
Yale y Gliese), el Sol como una más entre ellas, las 88 constelaciones trazadas
en 3D sobre estrellas reales, nebulosas en sus coordenadas auténticas y un disco
galáctico procedural con los cuatro brazos espirales, el bulbo y los cúmulos
globulares del halo.

Todo en el navegador, sin dependencias externas ni assets que descargar:
Three.js va empaquetado (`vendor/three`, r186) y los datos, en binario propio.

## Ejecutar

Necesitas un servidor estático (los `fetch` de los datos no funcionan con
`file://`):

```bash
# Windows
start.bat

# Linux / macOS
./start.sh

# o a mano
python -m http.server 8080     # → http://localhost:8080
```

`./start.sh` (y `start.bat`) usa `scripts/dev-server.mjs` cuando hay Node: un
servidor estático con Server-Sent Events que **recarga el navegador solo** al
guardar cualquier fichero de `index.html`, `css/`, `js/`, `data/` o `vendor/`.
También con `npm run dev`. Sin Node cae al servidor estático de Python.

## Controles

| Tecla / ratón | Acción |
|---|---|
| `W` `A` `S` `D` | volar en la dirección de la mirada |
| `Q` / `E` | subir / bajar ( polo norte galáctico arriba ) |
| `Shift` | turbo (×6) |
| Arrastrar | orbitar alrededor del punto de vista |
| Rueda | acercar / alejar (escala logarítmica) |
| Clic en estrella | selección + ficha con datos reales |
| Doble clic | viajar hasta la estrella |
| `1`…`9` | Sol, Sirio, Canopus, α Centauri… |
| `←` `→` | velocidad de vuelo (0,05–5.000 pc/s) |
| `C` `N` `G` `B` | constelaciones, nombres, disco, brillo |
| `H` / `Esc` | ayuda / soltar selección |

Enlaces directos: `http://localhost:8080/#sirio`, `#vega`, `#betelgeuse`…

## Los datos, en serio

- **Catálogo** — HYG v4.1 (119.625 estrellas): RA/Dec/distancia, magnitud
  absoluta, tipo espectral, color B−V, nombre propio y constelación. El Sol se
  añade aparte como estrella más (G2V, en el origen).
- **Marco** — las posiciones ecuatoriales se rotan al **marco galáctico**:
  X hacia el centro (l = 0), Y hacia el polo norte galáctico. El Sol vive en el
  origen y el centro galáctico (Sgr A*) a 8.178 pc en +X (GRAVITY 2019). La
  comprobación del build comprueba que Sirio cae en (l, b) = (227,2°, −8,9°).
- **Constelaciones** — líneas de [d3-celestial](https://github.com/ofrohn/d3-celestial)
  (heredadas de Stellarium). Cada vértice se "engancha" a la estrella real más
  cercana del catálogo (< 1°); la última generación: **0 de 893 sin enganchar**.
- **Brillo físico** — el shader calcula el flujo ∝ 10^(−0,4·M)/d² comprimido a
  gamma 0,4: una estrella se ve tenue a distancia real y satura (con bloom)
  cuando te acercas. El disco procedural, en cambio, usa intensidad fija: cada
  punto representa millones de estrellas no resolubles.
- **Nebulosas** — M42 (386 pc), M8 (1.250 pc), M20 (1.150 pc) y M17 (1.700 pc)
  en coordenadas ecuatoriales reales, con textura procedural.

### Regenerar los datos

Los binarios de `data/` ya vienen listos; solo necesitas esto si cambias la
fuente o el formato:

```bash
bash scripts/fetch-data.sh        # descarga los crudos a data/raw/ (34 MB)
python scripts/build-data.py      # reconstruye stars.bin, lines.bin, cons.json…
```

Tierra quemada de una: la columna `ra` del HYG v4.1 viene en **horas
decimales**, no en grados (el build multiplica por 15 y lo verifica con Sirio).

## Estructura

```
index.html          entrada
css/style.css       HUD (glass, chips, panel)
js/config.js        marco galáctico, parámetros del disco, chips, constelaciones ES
js/data.js          parseo de stars.bin / líneas / tablas de nombres
js/galaxy.js        disco + brazos + bulbo + halos + campo profundo (sembrado)
js/sky.js           puntos, líneas, nebulosas, etiquetas, picking, ficha
js/shaders.js       shader único estrella real / campo procedural
js/camera.js        rig de vuelo (flyTo sin follow: las estrellas no se mueven)
js/ui.js            chips, panel, interruptores, ayuda
js/live.js          recarga la pestaña cuando el VPS publica una versión nueva
js/main.js          motor, WASD, selección, bucle
js/noise.js         Perlin/fBm determinista
data/               stars.bin (3,3 MB), líneas, tablas (generados)
scripts/            fetch-data.sh + build-data.py + dev-server.mjs (recarga en vivo)
vendor/three/       Three.js r186 empaquetado (addons incluidos)
```

## Verificación

No hay suite de tests: la puerta es `node --check` + una carga real.

```bash
node --check js/*.js
python -m http.server 8081       # y abrir en el navegador
```

La última pasada de desarrollo (Chrome headless + CDP): carga en ~1,1 s,
**cero errores de consola**, viajes a Sirio y α Centauri con panel correcto,
vuelo WASD y toggles verificados con capturas.

## Despliegue

El sitio está en producción en el servidor:
**<http://212.227.41.107/milky-way/>** (también desde el índice de la raíz).
Cada push a `main` que toque `index.html`, `css/`, `js/`, `vendor/`, `data/` o
el propio despliegue dispara el workflow `.github/workflows/deploy.yml`, que
ejecuta el mismo `scripts/deploy.sh` que en local: sube todo por ssh,
intercambia el directorio de forma atómica (el sitio nunca queda a medias) y
comprueba la URL pública.

- Config local en `.env` (gitignored; copia `.env.example`). En local el acceso
  al VPS es el helper del escritorio (`VPS_SSH="bash ~/Desktop/vps.sh"`); en CI
  los valores y la clave ssh vienen de los secrets del repo (`VPS_HOST`,
  `VPS_USER`, `VPS_SSH_PORT`, `VPS_DEPLOY_PATH`, `VPS_SSH_KEY`, `SITE_URL`),
  con el host key fijado en `.github/known_hosts`.
- `scripts/deploy.sh --dry-run` lista lo que viajaría sin tocar nada. Los
  catálogos crudos (`data/raw/`) no se suben: solo los binarios de `data/`.
- En el VPS, nginx sirve el alias `/milky-way/` sobre `/var/www/html/milky-way/`
  (bloque en `sites-enabled/discord-jcd`).
- **Recarga en vivo**: `deploy.sh` escribe `version.txt` en el servidor (dentro
  de la carpeta temporal, antes del intercambio atómico) y `js/live.js` lo
  sondea cada 5 s; si cambió, la pestaña abierta se recarga sola, sin F5. En
  local no hay `version.txt`, así que el sondeo no hace nada.
- La checklist completa para dar de alta otro proyecto de este estilo está en
  el README de `earth-threejs` (sección «Dar de alta un proyecto nuevo en el
  VPS»).

## Créditos de datos

- [HYG Database v4.1](https://github.com/astronexus/HYG-Database) (astronexus),
  compilado a partir de Hipparcos, Yale Bright Star Catalog y Gliese.
- [d3-celestial](https://github.com/ofrohn/d3-celestial) (Olaf Frohn), líneas de
  constelaciones derivadas de Stellarium.
