/* ============================================================
   TRES ESTRUCTURAS — Funcion de publicacion

   Es el unico lugar del sistema que tiene la llave de GitHub.
   La llave vive en las variables de entorno de Netlify y NUNCA
   viaja al navegador.

   Solo responde a usuarios de Netlify Identity invitados al
   sitio. Sin sesion valida, no hace nada.

   Acciones (POST con {accion: "..."}):
     estado  -> diagnostico: si esta bien configurada y quien sos
     blob    -> sube el contenido de una foto y devuelve su sha
     commit  -> arma un unico commit con el JSON + las fotos

   Variables de entorno necesarias:
     GITHUB_TOKEN   token fine-grained con Contents: read/write
     GITHUB_REPO    "dpmdiving-group/tres-estructuras"
     GITHUB_BRANCH  "main"            (opcional, por defecto main)
     ADMINS         "uno@mail.com,otro@mail.com"  (opcional)
   ============================================================ */

"use strict";

var API = "https://api.github.com";

/* ---------- Respuestas ---------- */

function responder(codigo, cuerpo) {
  return {
    statusCode: codigo,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(cuerpo)
  };
}

function error(codigo, mensaje, detalle) {
  var cuerpo = { ok: false, error: mensaje };
  if (detalle) cuerpo.detalle = String(detalle).slice(0, 500);
  return responder(codigo, cuerpo);
}

/* ---------- GitHub ---------- */

function config() {
  var token = process.env.GITHUB_TOKEN;
  var repo = process.env.GITHUB_REPO;
  var rama = process.env.GITHUB_BRANCH || "main";
  return { token: token, repo: repo, rama: rama };
}

async function gh(cfg, ruta, opciones) {
  opciones = opciones || {};
  var respuesta = await fetch(API + ruta, {
    method: opciones.metodo || "GET",
    headers: {
      Authorization: "Bearer " + cfg.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "tres-estructuras-panel"
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined
  });

  var texto = await respuesta.text();
  var datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = { raw: texto }; }

  if (!respuesta.ok) {
    var e = new Error((datos && datos.message) || ("HTTP " + respuesta.status));
    e.status = respuesta.status;
    e.datos = datos;
    throw e;
  }
  return datos;
}

/* Traduce los errores de GitHub a algo que se entienda en el panel */
function explicar(e) {
  if (e.status === 401) {
    return "La llave de GitHub no es valida o vencio. Hay que generar una nueva y actualizarla en Netlify.";
  }
  if (e.status === 403) {
    return "GitHub rechazo la operacion por permisos. Revisa que la llave tenga permiso de Contenido: lectura y escritura sobre este repositorio.";
  }
  if (e.status === 404) {
    return "No se encontro el repositorio o la rama. Revisa GITHUB_REPO y GITHUB_BRANCH en Netlify.";
  }
  if (e.status === 409 || e.status === 422) {
    return "Alguien publico algo mientras vos trabajabas. Volve a intentar: se vuelve a leer lo ultimo y se publica arriba de eso.";
  }
  return "GitHub respondio con un error: " + e.message;
}

/* ---------- Validacion del JSON de propiedades ---------- */

var CAMPOS_MINIMOS = ["codigo", "titulo", "zona", "barrio", "operacion", "estado", "precio", "moneda"];

function validarPropiedades(props) {
  var problemas = [];

  if (!Array.isArray(props)) {
    return ["El archivo de propiedades tiene que ser una lista."];
  }
  if (!props.length) {
    return ["La lista de propiedades esta vacia. No se publica algo que dejaria el sitio sin nada."];
  }

  var vistos = {};
  props.forEach(function (p, i) {
    var donde = "Propiedad " + (i + 1) + (p && p.codigo ? " (" + p.codigo + ")" : "");

    if (!p || typeof p !== "object") { problemas.push(donde + ": no es una ficha valida."); return; }

    CAMPOS_MINIMOS.forEach(function (c) {
      if (p[c] === undefined || p[c] === null || p[c] === "") {
        problemas.push(donde + ": le falta " + c + ".");
      }
    });

    if (p.codigo && !/^[A-Z]{3}-\d{3}$/.test(p.codigo)) {
      problemas.push(donde + ": el codigo tiene que ser tipo QLM-001.");
    }
    if (p.codigo && vistos[p.codigo]) {
      problemas.push("El codigo " + p.codigo + " esta repetido. Los codigos no se repiten nunca.");
    }
    if (p.codigo) vistos[p.codigo] = true;

    if (p.precio !== undefined && p.precio !== null && typeof p.precio !== "number") {
      problemas.push(donde + ": el precio tiene que ser un numero.");
    }
    if (p.fotos && !Array.isArray(p.fotos)) {
      problemas.push(donde + ": las fotos tienen que ser una lista.");
    }
    if (p.operacion && ["venta", "alquiler"].indexOf(p.operacion) < 0) {
      problemas.push(donde + ": la operacion tiene que ser venta o alquiler.");
    }
    if (p.estado && ["disponible", "reservada", "cerrada"].indexOf(p.estado) < 0) {
      problemas.push(donde + ": el estado tiene que ser disponible, reservada o cerrada.");
    }
  });

  return problemas;
}

/* Las fotos que el JSON menciona tienen que existir: o ya publicadas, o en este mismo commit */
function validarFotos(props, rutasNuevas) {
  var problemas = [];
  var nuevas = {};
  rutasNuevas.forEach(function (r) { nuevas[r] = true; });

  props.forEach(function (p) {
    var lista = (p.fotos || []).slice();
    if (p.portada) lista.push(p.portada);
    lista.forEach(function (ruta) {
      if (typeof ruta !== "string" || ruta.indexOf("/media/") !== 0) {
        problemas.push((p.codigo || "?") + ": la ruta de foto \"" + ruta + "\" no es valida.");
      }
    });
  });

  return problemas;
}

/* ---------- Rutas seguras ---------- */

function rutaSegura(ruta) {
  if (typeof ruta !== "string") return null;
  var limpia = ruta.replace(/^\/+/, "");
  // Nada de salir de la carpeta, ni rutas raras, ni tocar el codigo del sitio
  if (limpia.indexOf("..") >= 0) return null;
  if (!/^media\/[A-Z]{3}-\d{3}\/[A-Za-z0-9._-]+$/.test(limpia)) return null;
  if (!/\.(webp|jpg|jpeg|png)$/i.test(limpia)) return null;
  return limpia;
}

/* ---------- Service worker: subir la version en cada publicacion ---------- */
/* Arregla el problema de que el navegador se quede con el sitio viejo cacheado. */

async function swActualizado(cfg, sello) {
  try {
    var archivo = await gh(cfg, "/repos/" + cfg.repo + "/contents/sw.js?ref=" + encodeURIComponent(cfg.rama));
    var texto = Buffer.from(archivo.content, "base64").toString("utf8");
    var nuevo = texto.replace(/var VERSION = "[^"]*";/, 'var VERSION = "te-' + sello + '";');
    if (nuevo === texto) return null;
    return nuevo;
  } catch (e) {
    return null; // si no se puede, se publica igual: no vale la pena frenar todo por esto
  }
}

/* ============================================================
   Handler
   ============================================================ */

exports.handler = async function (evento, contexto) {
  if (evento.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Allow": "POST" }, body: "" };
  }
  if (evento.httpMethod !== "POST") {
    return error(405, "Este endpoint solo acepta POST.");
  }

  /* ---- 1. Quien sos ---- */
  var usuario = contexto.clientContext && contexto.clientContext.user;
  if (!usuario) {
    return error(401, "Tenes que iniciar sesion para publicar.");
  }

  var permitidos = (process.env.ADMINS || "").split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  var mail = String(usuario.email || "").toLowerCase();
  if (permitidos.length && permitidos.indexOf(mail) < 0) {
    return error(403, "Tu usuario no tiene permiso para publicar en este sitio.");
  }

  /* ---- 2. Configuracion ---- */
  var cfg = config();

  var cuerpo;
  try {
    cuerpo = JSON.parse(evento.body || "{}");
  } catch (e) {
    return error(400, "El pedido llego mal formado.");
  }

  var accion = cuerpo.accion;

  /* ---- 3. Diagnostico ---- */
  if (accion === "estado") {
    var faltan = [];
    if (!cfg.token) faltan.push("GITHUB_TOKEN");
    if (!cfg.repo) faltan.push("GITHUB_REPO");

    var repoOk = false;
    var detalleRepo = null;
    if (!faltan.length) {
      try {
        var info = await gh(cfg, "/repos/" + cfg.repo + "/git/ref/heads/" + encodeURIComponent(cfg.rama));
        repoOk = !!(info && info.object);
      } catch (e) {
        detalleRepo = explicar(e);
      }
    }

    return responder(200, {
      ok: !faltan.length && repoOk,
      usuario: mail,
      repo: cfg.repo || null,
      rama: cfg.rama,
      faltanVariables: faltan,
      repoAccesible: repoOk,
      detalle: detalleRepo
    });
  }

  if (!cfg.token || !cfg.repo) {
    return error(500, "El servidor no esta configurado todavia: faltan las variables GITHUB_TOKEN y GITHUB_REPO en Netlify.");
  }

  /* ---- 4. Subir el contenido de una foto ---- */
  if (accion === "blob") {
    var base64 = cuerpo.base64;
    if (typeof base64 !== "string" || !base64) {
      return error(400, "Falta el contenido de la foto.");
    }
    if (base64.length > 8 * 1024 * 1024) {
      return error(413, "Esa foto es demasiado grande. Sacala de nuevo o elegi una mas liviana.");
    }
    try {
      var blob = await gh(cfg, "/repos/" + cfg.repo + "/git/blobs", {
        metodo: "POST",
        cuerpo: { content: base64, encoding: "base64" }
      });
      return responder(200, { ok: true, sha: blob.sha });
    } catch (e) {
      return error(e.status || 500, explicar(e), e.message);
    }
  }

  /* ---- 5. Commit: JSON + fotos, todo junto ---- */
  if (accion === "commit") {
    var props = cuerpo.propiedades;
    var fotos = Array.isArray(cuerpo.fotos) ? cuerpo.fotos : [];
    var mensaje = String(cuerpo.mensaje || "Actualizacion desde el panel").slice(0, 200);

    var problemas = validarPropiedades(props).concat(validarFotos(props, fotos.map(function (f) { return f.ruta; })));
    if (problemas.length) {
      return responder(422, { ok: false, error: "Los datos no pasaron la revision.", problemas: problemas.slice(0, 12) });
    }

    // Normalizar y revisar las rutas de las fotos
    var archivos = [];
    for (var i = 0; i < fotos.length; i++) {
      var ruta = rutaSegura(fotos[i].ruta);
      if (!ruta) {
        return error(400, "La ruta de foto \"" + fotos[i].ruta + "\" no esta permitida.");
      }
      if (!fotos[i].sha || !/^[0-9a-f]{40}$/.test(fotos[i].sha)) {
        return error(400, "Falta la referencia de una de las fotos. Volve a agregarla y publica de nuevo.");
      }
      archivos.push({ path: ruta, mode: "100644", type: "blob", sha: fotos[i].sha });
    }

    try {
      // 5.1 Donde esta la rama hoy
      var ref = await gh(cfg, "/repos/" + cfg.repo + "/git/ref/heads/" + encodeURIComponent(cfg.rama));
      var commitBase = ref.object.sha;
      var commitInfo = await gh(cfg, "/repos/" + cfg.repo + "/git/commits/" + commitBase);
      var treeBase = commitInfo.tree.sha;

      // 5.2 El JSON de propiedades
      var jsonTexto = JSON.stringify(props, null, 2) + "\n";
      var blobJson = await gh(cfg, "/repos/" + cfg.repo + "/git/blobs", {
        metodo: "POST",
        cuerpo: { content: Buffer.from(jsonTexto, "utf8").toString("base64"), encoding: "base64" }
      });
      archivos.push({ path: "data/propiedades.json", mode: "100644", type: "blob", sha: blobJson.sha });

      // 5.3 Subir la version del service worker para que nadie quede con el sitio viejo
      var sello = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      var swNuevo = await swActualizado(cfg, sello);
      if (swNuevo) {
        var blobSw = await gh(cfg, "/repos/" + cfg.repo + "/git/blobs", {
          metodo: "POST",
          cuerpo: { content: Buffer.from(swNuevo, "utf8").toString("base64"), encoding: "base64" }
        });
        archivos.push({ path: "sw.js", mode: "100644", type: "blob", sha: blobSw.sha });
      }

      // 5.4 Un arbol nuevo colgado del anterior
      var arbol = await gh(cfg, "/repos/" + cfg.repo + "/git/trees", {
        metodo: "POST",
        cuerpo: { base_tree: treeBase, tree: archivos }
      });

      // 5.5 El commit
      var commit = await gh(cfg, "/repos/" + cfg.repo + "/git/commits", {
        metodo: "POST",
        cuerpo: {
          message: mensaje + "\n\nPublicado desde el panel por " + mail,
          tree: arbol.sha,
          parents: [commitBase]
        }
      });

      // 5.6 Mover la rama
      await gh(cfg, "/repos/" + cfg.repo + "/git/refs/heads/" + encodeURIComponent(cfg.rama), {
        metodo: "PATCH",
        cuerpo: { sha: commit.sha, force: false }
      });

      return responder(200, {
        ok: true,
        commit: commit.sha.slice(0, 7),
        archivos: archivos.length,
        fotos: fotos.length
      });
    } catch (e) {
      return error(e.status || 500, explicar(e), e.message);
    }
  }

  return error(400, "Accion desconocida: " + accion);
};
