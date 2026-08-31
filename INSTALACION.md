# Cómo activar el panel con contraseña

Guía paso a paso. **No hace falta saber programar ni instalar nada.** Son cinco tareas, todas
en el navegador, una sola vez. Calculá media hora tranquilo, desde una computadora.

Cuando termines vas a poder cargar propiedades y fotos desde el teléfono, parado en la
propiedad, sin pasar por ninguna computadora nunca más.

Hacelas **en este orden**. Si algo no coincide con lo que ves en pantalla, pará y avisá: no
sigas adelante adivinando.

---

## Antes de empezar

Tené a mano:

- Tu usuario de **GitHub** (el dueño de `dpmdiving-group/tres-estructuras`)
- Tu usuario de **Netlify** (donde está publicado tresestructuras.com)
- El **mail** con el que querés entrar al panel

---

## Paso 1 — Subir los archivos nuevos a GitHub

1. Descomprimí el ZIP que te pasé. Vas a ver una carpeta con todo el sitio adentro.
2. Entrá a **https://github.com/dpmdiving-group/tres-estructuras**
3. Arriba a la derecha de la lista de archivos, tocá **"Add file"** → **"Upload files"**.
4. Arrastrá a la ventana del navegador **estas carpetas y archivos** del ZIP:

   ```
   admin/          (la carpeta entera)
   netlify/        (la carpeta entera — es nueva)
   js/             (la carpeta entera)
   data/           (la carpeta entera)
   index.html
   sw.js
   netlify.toml
   robots.txt
   INSTALACION.md
   ```

5. Abajo de todo, donde dice *"Commit changes"*, escribí:
   **`Panel con contraseña, publicación desde el teléfono y arreglos`**
6. Tocá el botón verde **"Commit changes"**.

GitHub te va a decir que está subiendo. Cuando termine, Netlify va a empezar a publicar solo.
**Todavía no funciona el login** — falta configurarlo. Es normal.

> Si preferís, este paso lo puede hacer Steve: pasale el ZIP y este archivo.

---

## Paso 2 — Prender el login en Netlify

1. Entrá a **https://app.netlify.com** y abrí el proyecto **tresestructuras.com**.
2. En el menú de la izquierda, buscá **Identity** (puede estar dentro de *Integrations*,
   *Extensions* o *Access & security*, según la versión).
3. Tocá **"Enable Identity"**.
4. Una vez prendido, entrá a **Identity → Settings → Registration**.
5. Elegí **"Invite only"**. Esto es importante: sin esto, cualquiera podría registrarse solo.

### Invitarte a vos mismo

6. Volvé a la pestaña **Identity** y tocá **"Invite users"**.
7. Escribí tu mail y tocá **Send**.
8. Te va a llegar un mail de Netlify. **Abrilo desde el teléfono o la computadora y tocá el
   link.** Te va a llevar al panel y te va a pedir que elijas una contraseña.
9. Elegí una contraseña de al menos 8 caracteres y guardala donde guardes tus contraseñas.

Si el link te lleva a la home del sitio en vez del panel, no pasa nada: el sitio lo redirige
solo al panel.

---

## Paso 3 — Crear la llave de GitHub

Esta llave es la que le da permiso al servidor para publicar por vos.

1. Entrá a **https://github.com/settings/personal-access-tokens/new**
   (o: foto de perfil → *Settings* → *Developer settings* → *Personal access tokens* →
   *Fine-grained tokens* → *Generate new token*).
2. Completá así:

   | Campo | Qué poner |
   |---|---|
   | **Token name** | `panel-tres-estructuras` |
   | **Expiration** | 1 año (anotate la fecha: hay que renovarla) |
   | **Resource owner** | **dpmdiving-group** |
   | **Repository access** | *Only select repositories* → elegí **tres-estructuras** |

3. Bajá hasta **"Repository permissions"**. Buscá **Contents** y ponelo en
   **"Read and write"**.

   Ese es el **único** permiso que hace falta. Todo lo demás dejalo en *No access*.

4. Tocá **"Generate token"**.
5. GitHub te muestra la llave **una sola vez**. Es un texto largo que empieza con
   `github_pat_`. **Copiala ahora** y dejá esa pestaña abierta hasta terminar el paso 4.

> ⚠️ **Esa llave no se le muestra a nadie.** No la pegues en un chat, ni en un mail, ni en
> WhatsApp — tampoco a mí. Va directo de esta pantalla a Netlify y listo. Si alguna vez se te
> escapa, entrá a la misma pantalla y tocá *Revoke*: deja de servir al instante.

---

## Paso 4 — Guardar la llave en Netlify

1. Volvé a Netlify, al proyecto **tresestructuras.com**.
2. **Site configuration** → **Environment variables** → **"Add a variable"**.
3. Cargá estas tres, una por una:

   | Key | Value |
   |---|---|
   | `GITHUB_TOKEN` | la llave que copiaste (pegala) |
   | `GITHUB_REPO` | `dpmdiving-group/tres-estructuras` |
   | `ADMINS` | tu mail (el mismo del paso 2) |

   `ADMINS` es un candado extra: solo los mails de esa lista pueden publicar. Si mañana sumás
   a alguien, separá los mails con comas y sin espacios.

4. Andá a **Deploys** y tocá **"Trigger deploy"** → **"Deploy site"**.

   Esto es necesario: las variables nuevas recién existen a partir del próximo deploy.

5. Esperá a que el deploy diga **Published** (uno o dos minutos).

---

## Paso 5 — Probarlo

1. En el teléfono, entrá a **tresestructuras.com/admin/**
2. Te tiene que pedir mail y contraseña. Entrá con los del paso 2.
3. Arriba tiene que quedar un punto verde y decir **"Conectado"**.
4. Tocá **"Importar propiedades.json"** para traer lo que hay publicado.
5. Cambiale el precio a una propiedad cualquiera.
6. Tocá **"Publicar en el sitio"**.
7. Esperá dos minutos y mirá el sitio: el precio nuevo tiene que estar.

Si llegaste hasta acá, **ya está andando**.

### Ponerle el ícono en la pantalla de inicio

- **Android (Chrome):** abrí `tresestructuras.com/admin/`, menú de los tres puntitos →
  *Agregar a pantalla principal*.
- **iPhone (Safari):** abrí `tresestructuras.com/admin/`, el botón de compartir (el cuadrado
  con la flecha) → *Agregar a inicio*.

Te queda un ícono que dice **Panel TE**. Se abre a pantalla completa, sin barra del navegador.

> En iPhone, **instalarlo es obligatorio** si querés que más adelante te lleguen los avisos de
> vencimientos. Safari no manda notificaciones si no está instalado.

---

## Cómo se usa ahora

**Cargar una propiedad, parado en la unidad:**

1. Abrí el panel desde el ícono.
2. "+ Nueva propiedad".
3. Tocá la zona de fotos → *Cámara* → sacá las fotos. **Cada foto se sube sola** apenas la
   sacás; el puntito de arriba te muestra cuántas faltan.
4. Los datos: para la descripción, usá el **micrófono del teclado** y dictala. Es mucho más
   rápido que escribir.
5. "Guardar propiedad".
6. "Publicar en el sitio".

**Si te quedás sin señal:** seguí cargando igual. Las fotos quedan guardadas en el teléfono y
se suben solas cuando volvés a tener señal. El botón *Publicar* se activa recién cuando
terminaron de subir todas.

**Si se cierra la pestaña o se apaga el teléfono:** no se pierde nada. Volvé a abrir el panel
y las fotos siguen ahí.

---

## Si algo sale mal

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| "El login todavía no está activado" | Falta el paso 2 | Prendé Identity en Netlify |
| "Mail o contraseña incorrectos" | Contraseña mal, o nunca aceptaste la invitación | Tocá *Me olvidé la contraseña* |
| "El servidor no está configurado todavía" | Faltan las variables | Revisá el paso 4 y volvé a hacer deploy |
| "La llave de GitHub no es válida o venció" | La llave venció o se revocó | Rehacé el paso 3 y el 4 |
| "Tu usuario no tiene permiso para publicar" | Tu mail no está en `ADMINS` | Agregalo en Netlify y hacé deploy |
| "Los datos no pasaron la revisión" | Hay una propiedad mal cargada | La pantalla te dice cuál y qué le falta |
| "Alguien publicó algo mientras trabajabas" | Dos publicaciones a la vez | Tocá publicar de nuevo |
| Botón *Publicar* apagado | Hay fotos subiendo | Esperá a que el puntito se ponga verde |

**Nada de esto pierde tus datos.** Si una publicación falla, todo lo que cargaste sigue en el
panel, tal como lo dejaste. Podés reintentar cuando quieras.

---

## Cosas para tener en cuenta

- **No cambies el código de una propiedad que ya tiene el cartel impreso.** El QR apunta a ese
  código. Si la propiedad se vendió, marcala como *cerrada*: el QR sigue vivo y lleva a una
  página que ofrece las otras unidades.
- **La llave de GitHub vence al año.** Anotate la fecha. Cuando venza, el panel te lo va a
  decir con todas las letras y solo hay que rehacer los pasos 3 y 4.
- **Poné verificación en dos pasos** en GitHub y en Netlify. Son las dos cuentas que controlan
  el sitio.
- **Si perdés el teléfono:** entrá a Netlify → Identity, buscá tu usuario y cambiale la
  contraseña. Quien tenga el teléfono deja de poder publicar. La llave de GitHub no está en el
  teléfono, así que no hay nada más que hacer.
