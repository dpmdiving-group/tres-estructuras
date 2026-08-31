# Tres Estructuras — Manual de uso

Este es el sitio de **Tres Estructuras**: propiedades propias en alquiler y venta, zona sur del GBA.
Este manual está escrito para usarlo **sin saber programar**. Guardalo a mano.

> Para activar el panel con contraseña por primera vez, mirá **INSTALACION.md**.

---

## Las 3 cosas que vas a hacer siempre

### 1. Cargar o cambiar una propiedad

Se hace **desde el teléfono**, parado en la propiedad. No hace falta computadora.

1. Abrí el panel desde el ícono **Panel TE** de la pantalla de inicio
   (o entrá a `tresestructuras.com/admin/` y entrá con tu mail y contraseña).
2. La primera vez del día, tocá **"Importar propiedades.json"** para traer lo último publicado.
3. Tocá **"+ Nueva propiedad"** (o **"Editar"** en una existente).
   - El código (QLM-001, BER-002…) se sugiere solo. **Nunca repitas un código, ni siquiera de una propiedad vendida.**
   - Sacá las fotos con la cámara: se convierten solas y **se suben solas** mientras seguís sacando.
     La primera es la portada. El puntito de arriba te dice si falta subir alguna.
   - Para la descripción, usá el **micrófono del teclado** y dictala. Va en nuestro tono:
     qué se recicló, qué quedó original, qué falta. Sin "oportunidad única".
4. Tocá **"Guardar propiedad"**.
5. Tocá **"Publicar en el sitio"**. Listo: en un par de minutos está online.

**Si te quedás sin señal:** seguí cargando igual. Todo queda guardado en el teléfono y se sube
solo cuando volvés a tener señal. Si se cierra la pestaña, no se pierde nada.

**El botón Publicar apagado** quiere decir que todavía hay fotos subiendo. Esperá a que el
puntito se ponga verde.

### 2. Marcar una propiedad como reservada o vendida

En el panel, en la lista de propiedades, cambiá el **Estado** directamente:

- **Disponible**: se muestra en el sitio.
- **Reservada**: se muestra con etiqueta de reservada.
- **Cerrada**: desaparece de la lista, PERO su página sigue viva y le dice al que
  escanea un cartel viejo "esta propiedad ya no está disponible, mirá estas otras".
  **Nunca borres una propiedad que tuvo cartel en la calle: marcala Cerrada.**

Después descargá el JSON y publicalo (paso 4 y 5 de arriba).

### 3. Imprimir un cartel

1. En el panel, al lado de cada propiedad hay un botón **"Cartel + QR"**.
2. Se abre el cartel listo. Tocá **"Imprimir"** (en A4, con color).
3. El QR de ese cartel abre la página de ESA propiedad, y cuando alguien escribe
   por WhatsApp el mensaje dice "Escaneé el QR del cartel" — así sabés que el
   cartel funciona.
4. También podés: **descargar el QR solo en PNG** (para un flyer o un posteo), o
   imprimir la **hoja con todos los QRs** para pegar la tanda entera de una.

> ⚠️ **IMPORTANTE**: no imprimas carteles hasta que el sitio esté publicado en el
> dominio definitivo. El QR lleva la dirección del sitio impresa: si después
> cambiás de dominio, esos carteles quedan muertos.

---

## Cómo publicar (el método viejo, por si algún día falla el panel) los cambios en el sitio

El sitio vive en **GitHub** (donde están los archivos) y se publica solo con
**Netlify** (el servicio que lo muestra en internet). Subir archivos = publicar.

1. Entrá a tu repositorio en **github.com** e iniciá sesión.
2. Entrá a la carpeta `data/`, tocá el archivo `propiedades.json` → botón del
   lápiz o **"Upload files"** → subí el `propiedades.json` nuevo (el del ZIP).
3. Si hay fotos nuevas: entrá a la carpeta `media/` → **"Upload files"** → arrastrá
   las carpetas de fotos del ZIP (por ejemplo `QLM-003/`).
4. Abajo tocá el botón verde **"Commit changes"**.
5. Listo. En 1-2 minutos Netlify publica solo. No hay que tocar nada más.

---

## Registro de consultas (leads)

En el panel, pestaña **"Consultas"**:

- Cuando te llega un WhatsApp, tocá **"+ Nueva consulta"** y **pegá el mensaje tal
  cual llegó**: el panel detecta solo el código de la propiedad y de dónde vino
  (cartel, web, Instagram, Facebook, Marketplace).
- Andá cambiando el estado de cada consulta: Nuevo → Contactado → Visita → Reservado → Cerrado.
- Arriba ves las métricas: consultas de la semana, por fuente, y la propiedad más pedida.
- **"Exportar a Excel"** te baja todo en un archivo para analizar o archivar.
- Las consultas se guardan en el navegador donde las cargaste. Bajá el
  **"Respaldo JSON"** cada tanto por seguridad.

---

## Los videos y el 360

- **Video común**: subilo a YouTube como **"No listado"**, copiá el ID (lo que va
  después de `watch?v=`), y pegalo en el campo Video del panel.
- **Video 360**: también YouTube no listado. El video tiene que estar grabado en
  equirectangular y tener la metadata 360 (si la cámara es 360, ya la trae; si
  YouTube lo muestra plano y deformado, falta inyectar la metadata con la
  herramienta "Spatial Media Metadata Injector" antes de subirlo).
- Alternativa sin YouTube: subir un archivo .mp4 a algún hosting y pegar la URL
  con tipo "MP4". El sitio tiene su propio reproductor 360.

---

## Primera puesta en marcha (una sola vez)

Esto se hace una sola vez. Si ya está hecho, ignorá esta sección.

1. **Número de WhatsApp**: abrí el archivo `js/config.js` y completá:
   - `whatsapp`: formato `549` + código de área sin 0 + número sin 15.
     Ejemplo AMBA: `5491123456789`. **Este es el único lugar donde vive el número.**
   - `telefonoVisible`: como quieras que se lea en el sitio, ej. `11 2345-6789`.
2. **Dominio**: compralo (por ejemplo `tresestructuras.com.ar` en nic.ar) y
   escribilo en `js/config.js` en el campo `dominio`.
3. **Cuenta de GitHub**: crear en github.com, crear un repositorio llamado
   `tres-estructuras`, y subir TODA esta carpeta.
4. **Netlify**: crear cuenta en netlify.com con el botón "Log in with GitHub" →
   "Add new site" → "Import an existing project" → elegir el repositorio.
   No hay que configurar nada más: el sitio ya trae su configuración
   (`netlify.toml` hace el resto, incluida la generación de las previews de
   WhatsApp de cada propiedad).
5. **Conectar el dominio**: en Netlify → Domain settings → Add custom domain →
   seguir los pasos que indica (hay que pegar dos datos en nic.ar).
   El certificado HTTPS se activa solo.
6. **Probar antes de imprimir**: entrá a `tudominio.com.ar/p/QLM-001?f=cartel`
   desde el celular. Tiene que abrir la ficha y el botón de WhatsApp tiene que
   decir "Escaneé el QR del cartel" en el mensaje. Si eso anda, ya podés imprimir.
7. Reemplazá las propiedades de ejemplo por las reales (desde el panel) y las
   fotos de muestra por fotos reales.

---

## Preguntas frecuentes

**¿Cambié el número de WhatsApp, tengo que reimprimir los carteles?**
No. El número vive solo en `js/config.js`. Los QR apuntan a las páginas del
sitio, no al número. Cambiás el archivo, publicás, y los carteles viejos apuntan
al número nuevo.

**¿Puedo borrar una propiedad?**
Solo si nunca tuvo cartel ni se compartió su link. Si no, marcala **Cerrada**:
su página queda viva avisando que ya no está y mostrando otras opciones.

**¿Por qué no aparece la foto cuando pego el link en WhatsApp?**
La preview la genera Netlify en cada publicación. Si acabás de publicar, esperá
un par de minutos. Y verificá que la propiedad tenga foto de portada.

**El sitio muestra precios viejos en mi celular.**
Cerrá y volvé a abrir el navegador. El sitio guarda una copia para andar rápido,
pero siempre busca datos frescos cuando hay conexión.

**¿Qué archivos NO tengo que tocar nunca?**
Todo lo que está en `js/`, `css/`, `herramientas/` y los archivos sueltos de la
raíz (excepto `js/config.js` para el número y el dominio). El día a día pasa
solo por `data/propiedades.json` y `media/` — y todo eso lo maneja el panel.

---

## Qué es cada carpeta (por si tenés curiosidad)

```
tres-estructuras/
├── index.html            La página de inicio
├── propiedad.html        La ficha de cada propiedad
├── cartel.html           El cartel imprimible con QR
├── admin/                Tu panel de carga y consultas (no aparece en Google)
├── data/propiedades.json TODAS las propiedades viven acá
├── media/                Las fotos, una carpeta por código
├── css/ y js/            El diseño y el funcionamiento (no tocar)
├── herramientas/         El generador de previews de WhatsApp (corre solo)
├── assets/               Logo e íconos
├── manifest.json, sw.js  Hacen que el sitio se pueda "instalar" y ande rápido
├── _redirects, netlify.toml   Configuración de Netlify (no tocar)
└── sitemap.xml, robots.txt    Para Google (se regeneran solos)
```
