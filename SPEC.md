# Tres Estructuras — Especificación completa v2

**Sistema de gestión y venta de propiedades. Zona sur del Gran Buenos Aires.**
Documento de referencia del sistema tal como está construido y funcionando.
Sirve como spec de entrega para cualquier desarrollador que deba mantenerlo, extenderlo o reconstruirlo.

---

## 1. Qué es

Un sistema de dos piezas que funcionan juntas sin ningún servidor propio:

**A. Web pública** (`tresestructuras.com.ar`) — catálogo mobile-first de propiedades propias en alquiler y venta. Su único objetivo: convertir cada visita en una consulta de WhatsApp con atribución de origen. El recorrido central: alguien ve el cartel en la calle → escanea el QR → se abre la ficha de esa propiedad exacta → toca el botón verde → WhatsApp se abre con el mensaje ya escrito, incluyendo el código de la propiedad y de dónde vino.

**B. Panel de gestión** (`/admin/`) — herramienta privada del dueño que corre 100% en el navegador. Cinco módulos: Propiedades (carga y edición), Consultas (CRM de leads), Agenda (visitas de clientes), Trabajos (mantenimiento por categoría y trabajador) y Contabilidad (ingresos/gastos con cierre mensual). Sin login ni base de datos: los datos del negocio viven en el navegador del dueño con respaldos descargables; los datos públicos viven en un JSON del repositorio.

---

## 2. Decisiones de arquitectura (cerradas, no renegociar)

1. **Sitio 100% estático.** HTML + CSS + JavaScript vanilla. Sin frameworks, sin backend, sin base de datos, sin login. Hosting gratuito en Netlify conectado a GitHub: push = publicado.
2. **`data/propiedades.json` es la única fuente de verdad** del catálogo. Publicar = editar ese archivo (vía panel) y subir.
3. **El número de WhatsApp vive en un solo campo** (`js/config.js`) y **jamás se imprime ni se codifica en un QR**. Los QR apuntan a la ficha; el día que cambie el número o se migre a la Cloud API, los carteles pegados en la calle siguen funcionando.
4. **Las URLs impresas no mueren nunca.** Los códigos de propiedad no se reutilizan; una propiedad "cerrada" desaparece del listado pero su URL responde con aviso y alternativas; el esquema de rutas no se cambia después de imprimir el primer cartel.
5. **La atribución es el mensaje.** Cada fuente (cartel/web/instagram/facebook/marketplace) cierra el mensaje de WhatsApp con una frase distinta. Sin cookies, sin analytics: se lee el mensaje entrante y se sabe de dónde vino y por qué propiedad.
6. **Único build step permitido:** en el deploy, Netlify ejecuta `herramientas/generar.js` (Node sin dependencias) que genera las páginas de preview de WhatsApp (`/p/{codigo}/`) y el `sitemap.xml` a partir del JSON. El desarrollo local no requiere build.

---

## 3. Marca

### Identidad
**Tres Estructuras** — bienes raíces, alquiler y venta. Las tres estructuras (casa, edificio, lote) se dibujan en lenguaje de plano de arquitecto: una sólida, una rayada, una en línea de trazos, sobre una línea de tierra con cotas (`assets/logo.svg`).

### Paleta vigente: "Azul Noche y Bronce"
Todos los pares texto/fondo verificados WCAG ≥ 4.5:1.

```css
--tinta:      #182430;  /* azul noche profundo. Header, texto principal */
--cal:        #ECEFF0;  /* gris azulado claro. Fondo general */
--papel:      #F9FAFA;  /* blanco de fichas y tarjetas */
--ocre:       #A68F60;  /* bronce. Acento, chip ALQUILER, baldosa */
--ocre-texto: #6D5B39;  /* bronce oscuro para texto (precios) */
--ladrillo:   #7A4646;  /* vino apagado. Chip VENTA, alertas */
--humo:       #57616A;  /* texto secundario, metadatos */
--wa:         #25D366;  /* verde WhatsApp. EXCLUSIVO del botón de contacto */
```

Regla sagrada: el verde de WhatsApp no se usa en ningún otro elemento. Significa una sola cosa: "tocando acá hablás con una persona".

### Tipografía
| Rol | Fuente | Uso |
|---|---|---|
| Display | Bricolage Grotesque | Títulos, precios, marca |
| Cuerpo | Public Sans | Párrafos, botones |
| Datos | IBM Plex Mono | Códigos, m², ambientes, fechas — solo datos duros |

### Elemento de firma
Patrón de **baldosa calcárea en CSS puro**, presente solo en tres lugares: franja del header, estado vacío de filtros, y franjas del cartel imprimible.

### Tono de la copy
Directo y honesto. Se dice qué se recicló, qué quedó original y qué falta. Nada de "oportunidad única" ni "coqueto". La honestidad es el diferencial frente a los portales.

---

## 4. Web pública — funcionalidades

### Home (`index.html`)
- Hero con posicionamiento ("unidades propias, sin comisión") y contador real calculado del JSON.
- Filtros por operación (Todas/Alquiler/Venta) y zona (Quilmes/Bernal/Avellaneda/Lanús/Lomas), pegados arriba al scrollear, **reflejados en la URL** (`?op=&zona=`) para poder compartir un filtro.
- Grilla responsive 1/2/3 columnas. Tarjeta: foto, chip de operación (bronce alquiler / vino venta), código en mono, título, zona, precio, expensas si hay, datos duros, indicador 360 si corresponde. Toda la tarjeta clickeable con foco visible.
- Estado vacío con baldosa y botón para limpiar filtros.

### Ficha (`propiedad.html?c=CODIGO`, rutas cortas `/p/{codigo}` y `/propiedad/{codigo}`)
Orden que replica cómo decide la gente:
1. **Galería**: swipe táctil, flechas, teclado (←/→/Enter), contador n/m, pantalla completa con Escape.
2. Precio, operación, código, ubicación aproximada (la dirección exacta se da por WhatsApp).
3. **Botón de WhatsApp** con el código visible; fijo abajo en mobile.
4. Datos duros en grilla mono (ambientes, dormitorios, baños, cocheras, m², antigüedad, expensas).
5. Descripción.
6. Video recorrido: embed de YouTube **diferido** (miniatura + play; el iframe no carga hasta el toque).
7. **Visor 360**: YouTube 360 por defecto; reproductor propio three.js para mp4 equirectangular (arrastre mouse/touch, latitud limitada ±85°, pantalla completa, giroscopio con botón de permiso en iOS). Carga perezosa total: nada se inicializa hasta entrar en viewport, y three.js (600 KB) se descarga recién al tocar play. Sin video → la sección no existe.
8. Amenities con iconos (diccionario extensible; clave desconocida se muestra con icono genérico, nunca se descarta).
9. Ubicación aproximada (sin API de mapas).
10. Tres propiedades relacionadas de la misma zona.

Estados especiales: propiedad **cerrada** → la URL vive, muestra "ya no está disponible" + alternativas. Código inexistente → mensaje amable + listado.

### Chat flotante (todo el sitio)
- Mobile: barra fija al pie de ancho completo. Desktop: círculo abajo a la derecha que se expande al hover.
- Texto contextual: "Consultar" en el home, "Consultar por QLM-014" dentro de una ficha.
- Nunca se abre solo. Respeta `prefers-reduced-motion`.
- Fuente de atribución: se captura de `?f=` al entrar, se guarda en `sessionStorage` para toda la visita, y define la frase de cierre del mensaje.

### QR y carteles (`cartel.html`)
- **Un QR por propiedad** (nunca "el QR de la web"). Codifica la ruta corta `{dominio}/p/{codigo}?f=cartel` — corta a propósito: menos caracteres = QR menos denso = se escanea de más lejos.
- Generado en el navegador (corrección de error nivel H); cero archivos que mantener: si cambia el dominio en config, todos los QR cambian solos.
- Tres salidas: cartel A4 imprimible (baldosa, operación grande, precio, 3 datos, QR de 62 mm, instrucción literal "Escaneá con la cámara del celular"), QR suelto en PNG (1024 px con zona de silencio), y hoja con los QR de todas las disponibles con líneas de recorte.
- Estilos `@media print` propios: sin barra de acciones, colores exactos, `@page` A4.

### SEO, compartir y PWA
- En cada deploy se generan páginas `/p/{codigo}/` con Open Graph (título con precio, descripción 155, foto de portada) y JSON-LD `RealEstateListing` — es lo que ve WhatsApp al pegar un link y lo que indexa Google, sin ejecutar JS. Redirigen al instante a la ficha conservando `?f=`.
- `sitemap.xml` generado del JSON; `robots.txt` con `/admin/` excluido.
- PWA: manifest con marca, íconos 192/512, service worker (datos red-primero para no mostrar precios viejos; estáticos y fotos caché-primero). Instalable en la pantalla de inicio.

### Rendimiento y accesibilidad (medidos, no prometidos)
- Carga inicial de la ficha sin media: **74 KB** (objetivo del spec: <150).
- WebP con lazy loading; embeds diferidos; fuentes con `font-display: swap`.
- **Cero violaciones WCAG 2.0 A/AA** (axe-core) en home, ficha y cartel: contraste ≥4.5:1, foco visible, navegación completa por teclado, áreas táctiles ≥44px, `prefers-reduced-motion`.

---

## 5. Panel de gestión (`/admin/`) — cinco módulos

Herramienta local: corre en el navegador, sin servidor. Datos en `localStorage` con **respaldo/importación JSON** en cada módulo. Es pública como URL pero inocua: solo edita la copia local de quien la abre; publicar requiere subir archivos al repositorio.

### 5.1 Propiedades
- Alta/edición/duplicado con validaciones (código único formato ZZZ-NNN, correlativo sugerido por zona, moneda por defecto USD venta / ARS alquiler, descripción mínima).
- Fotos: arrastrar y soltar → conversión automática a WebP máx. 1600 px en el navegador; la primera es la portada; reordenables.
- Cambio de estado rápido (disponible/reservada/cerrada) desde la lista. Al intentar borrar, sugiere "cerrada" para no matar QRs impresos.
- Export: `propiedades.json` solo, o ZIP con JSON + carpetas de fotos listas para subir. Botón "Cartel + QR" por propiedad.

### 5.2 Consultas (CRM de leads)
- Alta pegando el mensaje de WhatsApp recibido: **el parser detecta solo el código de propiedad y la fuente** (cartel/web/instagram/facebook/marketplace).
- Estados: nuevo → contactado → visita coordinada → reservado → cerrado ganado / descartado. Badge de nuevos sin atender.
- Métricas del spec: consultas por semana, total, por fuente, propiedad más consultada.
- Botón WhatsApp directo al interesado (normaliza teléfonos a 549…). Export CSV para Excel.

### 5.3 Agenda de visitas
- Calendario mensual (hoy resaltado, navegación, "ir a hoy"). Visitas como chips por día.
- Alta manual o **desde una consulta** con datos prellenados.
- Estados: pendiente/confirmada/realizada/cancelada (canceladas tachadas). Badge de pendientes futuras.
- **Confirmación por WhatsApp prearmada**: nombre, propiedad, fecha en castellano, hora, y "la dirección exacta te la pasamos por acá un rato antes".
- Impresión del mes en A4.

### 5.4 Grilla de trabajos
- Calendario mensual de mantenimiento con chips coloreados por **categoría**: limpieza, reparación, pintura, jardín, electricidad, plomería + categorías nuevas creadas al vuelo (color automático, persistidas).
- **Trabajadores** gestionables (nombre, teléfono, rubro). Cada trabajo: fecha, hora opcional, categoría, trabajador, propiedad, descripción, estado (pendiente/hecho/cancelado; hechos tachados).
- Filtros por categoría y trabajador que afectan calendario e impresión.
- **"Enviarle su mes por WhatsApp"**: mensaje con la lista de pendientes del mes del trabajador (fecha, hora, categoría, propiedad con barrio, descripción).
- **"Cargar gasto"** en cada trabajo → salta a Contabilidad con todo prellenado.

### 5.5 Contabilidad mensual
- Movimientos: ingreso/gasto, categoría (ingresos: alquiler, seña, venta, depósito, otro; gastos: materiales, mano de obra, servicios, impuestos, expensas, publicidad, honorarios, otro), propiedad opcional, monto en **ARS o USD (se llevan por separado, sin conversión)**, detalle.
- Cierre mensual: ingresos/gastos/resultado por moneda + **tabla de resultado por propiedad** (positivo verde / negativo rojo) + lista filtrable de movimientos.
- Export CSV para Excel (columnas Ingreso y Gasto separadas, formato regional) del mes o histórico completo. Impresión del cierre.
- No reemplaza al contador: ordena los números para dárselos.

---

## 6. Modelo de datos del catálogo

`data/propiedades.json` — array de objetos:

```json
{
  "codigo": "QLM-001",            // ZZZ-NNN. QLM/BER/AVE/LAN/LOM. Nunca se reutiliza.
  "titulo": "...", "zona": "Quilmes", "barrio": "...",
  "operacion": "venta|alquiler",
  "estado": "disponible|reservada|cerrada",
  "precio": 145000, "moneda": "USD|ARS",
  "expensas": null, "monedaExpensas": "ARS",
  "ambientes": 3, "dormitorios": 2, "banos": 1, "cocheras": 1,
  "m2Cubiertos": 78, "m2Totales": 130, "antiguedad": 42,
  "reciclada": true, "aptoCredito": true, "aptoMascotas": true,
  "descripcion": "Honesta: qué se recicló, qué quedó original, qué falta.",
  "portada": "/media/QLM-001/01.webp", "fotos": ["..."],
  "video":    { "tipo": "youtube|mp4", "id|url": "..." } | null,
  "video360": { "tipo": "youtube|mp4", "id|url": "..." } | null,
  "amenities": ["patio", "parrilla", "..."],   // claves sin acentos, diccionario extensible
  "destacada": true, "publicada": "2026-07-10"
}
```

Datos del panel (localStorage del navegador del dueño): `te_leads`, `te_visitas`, `te_trabajos`, `te_trabajadores`, `te_categorias`, `te_movs`, `te_borrador`.

---

## 7. Estructura de archivos

```
tres-estructuras/
├── index.html / propiedad.html / cartel.html
├── admin/index.html            Panel completo (5 módulos) + jszip.min.js
├── css/estilos.css             Sistema de diseño completo (tokens arriba de todo)
├── js/
│   ├── config.js               ÚNICO lugar del número de WhatsApp, dominio, zonas, amenities
│   ├── tarjetas.js             Helpers compartidos (window.TE)
│   ├── app.js / ficha.js / galeria.js / visor360.js / chat.js / qr.js / cartel.js
│   └── lib/                    three.min.js (r149), qrcode.js — vendoreados, sin CDN
├── data/propiedades.json       Fuente de verdad del catálogo
├── media/{codigo}/*.webp       Fotos (+ demo360.webm de prueba)
├── p/{codigo}/index.html       Generados: previews de WhatsApp/Google por propiedad
├── herramientas/generar.js     Generador (corre solo en el deploy de Netlify)
├── assets/                     logo.svg, íconos PWA, og-home.jpg
├── manifest.json / sw.js       PWA
├── _redirects / netlify.toml   Rutas cortas /p/:codigo, headers de caché, build
├── sitemap.xml / robots.txt
└── README.md                   Manual completo para no programadores
```

Deploy: GitHub + Netlify (build: `node herramientas/generar.js`, publish: raíz). Dominio propio `.com.ar` con HTTPS automático. **Regla: no imprimir ningún QR hasta estar publicado en el dominio definitivo.**

---

## 8. Criterios de aceptación (estado: todos verificados ✓)

- Entrada en frío a la ficha desde QR: carga rápida (74 KB iniciales), funciona en mobile.
- Botón de WhatsApp abre la app con mensaje que incluye código y fuente.
- QR por propiedad, decodificado y verificado: apunta a `/p/{codigo}?f=cartel`.
- Cambio del número de WhatsApp en un solo campo sin tocar carteles impresos.
- Filtros compartibles por URL. Cerrada → URL viva. Teclado completo con foco visible.
- Pegar link en WhatsApp muestra foto de portada (vía páginas /p/ generadas).
- Cero violaciones WCAG A/AA. Todo el flujo del panel probado con tests automatizados.

## 9. Roadmap corto
- Ficha: botón "Agendá tu visita" (día + franja → WhatsApp) y compartir.
- v2 si el volumen lo pide: carga desde Google Sheets; WhatsApp Cloud API con bot 24/7 (los datos del panel exportan directo).

---

## 10. Anexo para presupuestar: estimación de esfuerzo

Horas estimadas para construir este sistema desde este documento, con calidad equivalente (tests, accesibilidad verificada, rendimiento medido), por un desarrollador front-end semi-senior/senior trabajando solo:

| Bloque | Horas |
|---|---|
| Sistema de diseño + home con filtros en URL | 25–35 |
| Ficha completa (galería, estados, relacionadas, video diferido) | 30–40 |
| Visor 360 (three.js, lazy, giroscopio, estados) | 20–30 |
| WhatsApp + atribución + QR + cartel A4 + hoja de tanda + print CSS | 30–40 |
| SEO/OG por propiedad + generador + sitemap + PWA + redirects | 20–30 |
| Panel: Propiedades (fotos→WebP, export ZIP) | 30–40 |
| Panel: Consultas con parser + métricas + CSV | 15–20 |
| Panel: Agenda (calendario, WhatsApp, impresión) | 15–20 |
| Panel: Trabajos (categorías, trabajadores, envío por WhatsApp) | 20–25 |
| Panel: Contabilidad (multi-moneda, cierres, CSV) | 15–20 |
| QA transversal: accesibilidad, rendimiento, tests, pulido, README | 25–35 |
| **Total** | **245–335 hs** (≈ 7 a 9 semanas full-time) |
