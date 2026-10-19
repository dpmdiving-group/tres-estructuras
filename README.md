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
2. Al abrirlo, el panel trae solo lo último publicado. No hace falta importar nada.
3. Tocá **"+ Nueva propiedad"** (o **"Editar"** en una existente).
   - El código (QLM-001, BER-002…) se sugiere solo. **Nunca repitas un código, ni siquiera de una propiedad vendida.**
     Si le cambiás el código a una propiedad, el viejo sigue llevando a ella (los QR impresos no se rompen) y queda reservado.
   - Sacá las fotos con la cámara: se convierten solas y **se suben solas** mientras seguís sacando.
     La primera es la portada: para cambiarla tocá **"★ Portada"** en la foto que quieras.
     El puntito de arriba te dice si falta subir alguna.
     Con **✂** en cada foto elegís qué parte se ve: el sitio muestra las fotos en un cuadro
     apaisado (4:3), así que una foto vertical se ve recortada si no la encuadrás.
   - Para la descripción, usá el **micrófono del teclado** y dictala. Va en nuestro tono:
     qué se recicló, qué quedó original, qué falta. Sin "oportunidad única".
   - **"Referencia interna"** es opcional: la dirección o como la llaman ustedes ("Mitre 1234, 2° B").
     No se publica nunca; sirve para reconocerla rápido al elegirla en trabajos, visitas, consultas,
     contabilidad y cobros.
   - **"Mismo edificio que"**: si comparte edificio con otra propiedad, elegila. En la ficha se van
     a mostrar primero las del mismo edificio, después las del mismo barrio. No se publica ninguna dirección.
   - En **Amenities** tildá lo que tiene. Con **"Elegir qué opciones aparecen"** sacás de la lista
     las que nunca usan y agregás las propias (por ejemplo "Cochera cubierta"). Vale para todos
     los teléfonos, y destildar una opción no la borra de las propiedades que ya la tienen.
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

Después tocá **"Publicar en el sitio"**.

### ¿Y si publicamos desde dos teléfonos?

Se puede. Antes de publicar, el panel trae lo último que se publicó desde cualquier
otro teléfono y junta los cambios: si vos cambiaste el precio de una propiedad y otra
persona cambió el estado de otra, quedan las dos cosas. Si los dos cambiaron **lo
mismo** (por ejemplo, el precio de la misma propiedad), el panel te muestra las dos
versiones y te pregunta cuál queda. Nunca se pisa nada sin avisar.

### 3. Imprimir un cartel

1. En el panel, al lado de cada propiedad hay un botón **"Cartel + QR"**.
2. Se abre el cartel listo. Tocá **"Imprimir"** (en A4, con color).
3. El QR de ese cartel abre la página de ESA propiedad, y cuando alguien escribe
   por WhatsApp el mensaje dice "Escaneé el QR del cartel" — así sabés que el
   cartel funciona.
4. También podés: **descargar el QR solo en PNG** (para un flyer o un posteo), o
   imprimir la **hoja con todos los QRs** para pegar la tanda entera de una.
5. En la página de cada propiedad disponible, además del botón de WhatsApp, el
   interesado tiene **"Agendá tu visita"**: elige día y horario y te llega un WhatsApp
   del tipo "¿Puede ser el lunes 19/10, de 15 a 18 h?", con la misma frase de origen.
   Los días y horarios que se ofrecen se cambian en `js/config.js` (`visitas`).
   El botón **"Compartir"** manda el link de la propiedad por donde la persona quiera.

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
- Las consultas, la agenda, los trabajos y la contabilidad se **comparten entre todos
  los teléfonos** que entran al panel con su mail y contraseña: lo que carga uno, lo ven
  los demás. Si te quedás sin señal, se guarda en el teléfono y se manda solo cuando vuelve.
  Si dos personas cambian **la misma** consulta al mismo tiempo, queda el último cambio.
  Cada consulta, visita, trabajo y movimiento muestra **quién lo cambió por última vez y cuándo**,
  y arriba de las propiedades figura la **última publicación** (quién y cuándo).
- Si entrás sin conectarte, lo que cargues queda solo en ese teléfono hasta que entres.
- El **"Respaldo JSON"** sigue estando, por si querés guardar una copia aparte.
- Abajo de todo del panel está **"Descargar respaldo completo"**: un solo archivo con
  consultas, agenda, trabajos, cobros, contabilidad y propiedades. Bajalo una vez por semana y
  guardalo en el mail o en Drive. **"Restaurar un respaldo"** solo vuelve a agregar lo
  que falte: no borra ni cambia nada de lo que ya hay.

---

## Trabajos: categorías y trabajadores

- **"Categorías"** (arriba en Trabajos): cambiá el nombre o el color de cualquier categoría
  (se actualizan todos sus trabajos), agregá nuevas, y quitá las que nadie usa.
- **"Trabajadores"**: agregá, **editá** (nombre, WhatsApp, categoría habitual, DNI, dirección y
  notas sobre la persona) o quitá. El DNI, la dirección y las notas solo los ve el panel.
- Para mandarle los trabajos por WhatsApp: en su fila, **"Mandarle lo de hoy"** o **"lo de
  mañana"**; o tocá cualquier día del calendario y **"Mandarle a … lo de este día"**. El
  mensaje va con la hora y la dirección de cada trabajo. Con
  **"+ Trabajo"** en un trabajador se abre un trabajo nuevo ya asignado a él.
- **"Link para el celular"**: crea el link personal del trabajador y te deja mandárselo por
  WhatsApp. Con ese link ve **solo sus trabajos**, día por día (primero los atrasados), con
  la dirección y un botón "Cómo llegar", y marca cada uno **"Resuelto"** o **"No se pudo"**
  escribiendo el motivo. Lo que marca aparece en el calendario del panel ("Pancho: …").
  El link se muestra una sola vez: si se pierde o lo vio otra persona, creá uno nuevo y el
  anterior deja de funcionar. Para que sepa adónde ir, completá la **referencia interna** de
  la propiedad o el campo **"Dónde"** del trabajo.

## Cobro de alquileres (pestaña Cobros)

- Tocá **"+ Nuevo contrato"** y cargá: la propiedad, el inquilino, su WhatsApp, el monto,
  el día del mes en que vence, desde qué mes corre y, si tiene, cada cuántos meses se ajusta.
  "Cómo se nombra en los mensajes" es opcional (por ejemplo "Mitre 1234, 2° B").
- Si la propiedad es de un **tercero** y ustedes la administran, poné la **comisión %**: a
  Contabilidad va solo la comisión y en Cobros ves cuánto es para el propietario. Si le ponés
  la comisión a un contrato que ya tenía pagos, te ofrece corregir esos ingresos.
- Si el contrato ya venía de antes, en **"Al día hasta"** poné el último mes que ya cobraste
  (el panel propone el mes pasado): los meses anteriores no aparecen como deuda.
  Si incluye el mes actual, al guardar te ofrece registrarlo como pago para que también
  figure en **Contabilidad**. Los meses anteriores quedan como historial ("Al día").
- Arriba de todo, **"Para hacer hoy"** te dice qué falta: alquileres vencidos (una línea por
  inquilino con todos los meses que debe y el total), los que vencen en los próximos 5 días, ajustes que tocan y contratos
  que terminan en los próximos dos meses. El número rojo de la pestaña cuenta lo pendiente.
- **"Recordar por WhatsApp"** abre tu WhatsApp con el mensaje ya escrito para el inquilino
  ("…el alquiler de octubre vence el 10 de octubre: $ 350.000"). Lo mandás vos con un toque;
  el panel anota que ya avisaste. (Que se manden solos necesitaría la API paga de WhatsApp.)
- Cuando pagan, tocá **"Registrar pago"**. Se puede pagar en partes. El pago se carga solo
  como ingreso en **Contabilidad**, y con **"Constancia por WhatsApp"** le confirmás al
  inquilino lo que recibiste (no es un recibo legal ni fiscal).
- Cuando toca un ajuste, tocá **"Actualizar monto"** y elegí desde qué mes rige: los meses
  anteriores conservan el monto viejo. El panel no calcula el índice (ICL, IPC): poné el
  monto nuevo que corresponda.
- Si el contrato terminó, marcalo **Terminado** (no lo borres): queda el historial y lo que
  haya quedado debiendo.
- Abajo de cada mes ves qué falta cobrar, qué se cobró y cuántos están vencidos.
  "Exportar pagos (Excel)" baja todos los pagos.

## Los videos y el 360

- **Video común**: desde el celular, en la app de YouTube tocá **+ → Subir un video**,
  elegí el video y en visibilidad poné **"No listado"**. Cuando termine, tocá
  **Compartir → Copiar link** y pegá ese link en "Link del video" del panel (sirve
  cualquier link de YouTube, también los de Shorts). El panel te muestra la miniatura
  cuando lo reconoce. En la ficha el video se reproduce dentro de la página.
- **Video 360**: también YouTube no listado. El video tiene que estar grabado en
  equirectangular y tener la metadata 360 (si la cámara es 360, ya la trae; si
  YouTube lo muestra plano y deformado, falta inyectar la metadata con la
  herramienta "Spatial Media Metadata Injector" antes de subirlo).
- Un link de "Compartir" del celular (Quick Share, Drive, WhatsApp) no sirve: es una
  página, no un video. El panel no lo acepta.

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

**Algunas fotos del celular terminan en ".heic". ¿Se pueden subir?**
Sí. Son fotos de "alta eficiencia" y el panel las convierte solo (tarda unos
segundos por foto). Si querés evitarlo, desactivá "Imágenes de alta eficiencia"
en los ajustes de la cámara y las fotos nuevas salen en JPG.

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
