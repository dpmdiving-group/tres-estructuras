/* ============================================================
   TRES ESTRUCTURAS — Three-way merge of the property list

   Problem it solves: publishing used to replace the whole
   property list with the copy stored on the device. A device
   with an old copy silently wiped out changes published from
   another device.

   Now every device remembers the last version it received from
   the server (the "base"). Before publishing, its local copy is
   merged with the latest server version, property by property
   and field by field:

     - only one side changed a field  -> that change wins
     - both sides made the same change -> kept once
     - both sides changed it differently -> conflict, the user
       picks "mine" or "site" (default: site)

   A property whose code was changed keeps its old codes in
   "codigosAnteriores" (printed QRs still point at them). The merge
   uses them to recognise it as the same property, and no code or
   old code is ever handed to another property.

   Pure functions, no DOM. Runs in the browser (window.TE_MERGE)
   and in Node for the tests (module.exports).
   ============================================================ */

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TE_MERGE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- Helpers ---------- */

  function deepEqual(a, b) {
    if (a === b) return true;
    // A missing field and an explicit null mean the same thing in this data
    if (a == null && b == null) return true;
    if (typeof a !== typeof b || a == null || b == null) return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === "object") {
      if (Array.isArray(b)) return false;
      var keys = unionKeys(a, b);
      for (var k = 0; k < keys.length; k++) {
        if (!deepEqual(a[keys[k]], b[keys[k]])) return false;
      }
      return true;
    }
    return false;
  }

  function unionKeys() {
    var seen = {};
    var out = [];
    Array.prototype.forEach.call(arguments, function (obj) {
      if (!obj) return;
      Object.keys(obj).forEach(function (k) {
        if (!seen[k]) { seen[k] = true; out.push(k); }
      });
    });
    return out;
  }

  function byCode(list) {
    var map = {};
    (list || []).forEach(function (p) {
      if (p && p.codigo) map[p.codigo] = p;
    });
    return map;
  }

  function has(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key);
  }

  var CODE = /^[A-Z]{3}-\d{3}$/;

  function oldCodes(p) {
    return p && Array.isArray(p.codigosAnteriores)
      ? p.codigosAnteriores.filter(function (c) { return typeof c === "string" && CODE.test(c); })
      : [];
  }

  /* Which base property each item continues: the one with its code, or,
     if its code was changed, the one with one of its old codes.
     Returns [{key, item}] in list order; key is unique in the list. */
  function identify(list, B) {
    var used = {};
    var out = [];
    (list || []).forEach(function (p) {
      if (p && p.codigo && has(B, p.codigo)) used[p.codigo] = true;
    });
    (list || []).forEach(function (p) {
      if (!p || !p.codigo) return;
      var key = p.codigo;
      if (!has(B, key)) {
        oldCodes(p).some(function (c) {
          if (has(B, c) && !used[c]) { key = c; return true; }
          return false;
        });
      }
      if (key !== p.codigo) used[key] = true;
      out.push({ key: key, item: p });
    });
    return out;
  }

  function mapOf(pairs) {
    var map = {};
    pairs.forEach(function (x) { if (!has(map, x.key)) map[x.key] = x.item; });
    return map;
  }

  // Old codes only grow: everything any side knew, minus the current code
  function joinOldCodes(item, extra) {
    if (!item) return item;
    var seen = {};
    var list = [];
    extra.forEach(function (c) {
      if (typeof c === "string" && CODE.test(c) && c !== item.codigo && !seen[c]) { seen[c] = true; list.push(c); }
    });
    if (list.length) item.codigosAnteriores = list;
    else delete item.codigosAnteriores;
    return item;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  /* Codes are never reused, not even for deleted properties, so the
     next free number looks at every code any side has ever seen. */
  function nextFreeCode(prefix, takenCodes) {
    var max = 0;
    takenCodes.forEach(function (code) {
      var m = /^([A-Z]{3})-(\d{3})$/.exec(code);
      if (m && m[1] === prefix) max = Math.max(max, parseInt(m[2], 10));
    });
    return prefix + "-" + String(max + 1).padStart(3, "0");
  }

  function renamePhotoPath(path, fromCode, toCode) {
    if (typeof path !== "string") return path;
    return path.replace("/media/" + fromCode + "/", "/media/" + toCode + "/");
  }

  function renameProperty(p, toCode) {
    var copy = clone(p);
    var fromCode = copy.codigo;
    copy.codigo = toCode;
    copy.portada = renamePhotoPath(copy.portada, fromCode, toCode);
    copy.fotos = (copy.fotos || []).map(function (f) { return renamePhotoPath(f, fromCode, toCode); });
    return copy;
  }

  /* ---------- Field-level merge of one property ---------- */

  // base may be null: then nobody knows who changed what, and every
  // field where the two copies differ becomes a conflict.
  function mergeFields(base, local, remote) {
    var merged = {};
    var localPick = {};
    var conflicts = [];

    // Keep the site's field order so the published JSON stays stable
    unionKeys(remote, local, base).forEach(function (field) {
      var b = base ? base[field] : undefined;
      var l = local[field];
      var r = remote[field];
      var value;

      if (field === "codigosAnteriores") value = oldCodes(remote).concat(oldCodes(base), oldCodes(local));
      else if (deepEqual(l, r)) value = r;
      else if (base && deepEqual(l, b)) value = r;   // only the site changed it
      else if (base && deepEqual(r, b)) value = l;   // only this device changed it
      else {
        conflicts.push({ field: field, base: b, local: l, remote: r });
        value = r;                                   // default: site
        localPick[field] = l;
      }
      if (value !== undefined) merged[field] = clone(value);
    });

    var alternative = null;
    if (conflicts.length) {
      alternative = clone(merged);
      Object.keys(localPick).forEach(function (field) {
        if (localPick[field] === undefined) delete alternative[field];
        else alternative[field] = clone(localPick[field]);
      });
    }

    return { merged: merged, alternative: alternative, conflicts: conflicts };
  }

  /* ---------- Merge of the whole list ----------

     Returns:
       entries   [{codigo, value, alternative}] in final order.
                 codigo is the key the choices use: the property's
                 code, or its old code if it was changed.
                 value = default (site) choice, alternative = "mine".
                 null means "the property is not in the list".
       conflicts [{codigo, type, fields?, local, remote}]
                 type: "fields" | "deleted_on_site" | "deleted_here"
       renamed   [{from, to}] properties from this device whose code
                 had already been used on the site; they got the next
                 free code.
  */
  function merge(base, local, remote) {
    var hasBase = Array.isArray(base);
    var B = byCode(base);
    var remotePairs = identify(remote, B);
    var localPairs = identify(local, B);
    var L = mapOf(localPairs);
    var R = mapOf(remotePairs);

    var entries = [];
    var conflicts = [];
    var renamed = [];
    var appendedLocal = [];

    var taken = [];
    [base, local, remote].forEach(function (list) {
      (list || []).forEach(function (p) {
        if (p && p.codigo) taken.push(p.codigo);
        taken = taken.concat(oldCodes(p));
      });
    });

    // Every code the site uses (current or old) belongs to one property
    var siteOwner = {};
    remotePairs.forEach(function (x) {
      [x.item.codigo].concat(oldCodes(x.item)).forEach(function (c) {
        if (!has(siteOwner, c)) siteOwner[c] = x.key;
      });
    });

    function published(b, r) {
      return oldCodes(r).concat(oldCodes(b), [b && b.codigo, r && r.codigo]);
    }

    // 1. Everything the site has, in the site's order
    remotePairs.forEach(function (x) {
      var key = x.key;
      var r = x.item;
      var l = L[key];
      var b = B[key];
      var inBase = hasBase && has(B, key);

      if (l) {
        if (!inBase && hasBase && !deepEqual(l, r)) {
          // Both sides created a property with the same code
          entries.push({ codigo: key, value: clone(r), alternative: clone(r) });
          var newCode = nextFreeCode(l.codigo.slice(0, 3), taken);
          taken.push(newCode);
          renamed.push({ from: l.codigo, to: newCode });
          appendedLocal.push(renameProperty(l, newCode));
          return;
        }
        var res = mergeFields(inBase ? b : null, l, r);
        var extra = published(inBase ? b : null, r);
        joinOldCodes(res.merged, extra);
        if (res.conflicts.length) {
          joinOldCodes(res.alternative, extra);
          conflicts.push({ codigo: key, type: "fields", fields: res.conflicts, local: clone(l), remote: clone(r) });
          entries.push({ codigo: key, value: res.merged, alternative: res.alternative });
        } else {
          entries.push({ codigo: key, value: res.merged, alternative: res.merged });
        }
        return;
      }

      // Not on this device anymore
      if (inBase) {
        if (deepEqual(r, b)) {
          entries.push({ codigo: key, value: null, alternative: null });  // deleted here
        } else {
          // Deleted here, but someone changed it on the site meanwhile
          conflicts.push({ codigo: key, type: "deleted_here", local: null, remote: clone(r) });
          entries.push({ codigo: key, value: clone(r), alternative: null });
        }
      } else {
        // New on the site (or no base to tell): keep it
        entries.push({ codigo: key, value: clone(r), alternative: clone(r) });
      }
    });

    // 2. What only this device has
    localPairs.forEach(function (x) {
      var key = x.key;
      var l = x.item;
      if (R[key]) return;
      var inBase = hasBase && has(B, key);
      if (inBase) {
        if (deepEqual(l, B[key])) {
          entries.push({ codigo: key, value: null, alternative: null });  // deleted on the site
        } else {
          // Deleted on the site, but changed here meanwhile
          conflicts.push({ codigo: key, type: "deleted_on_site", local: clone(l), remote: null });
          entries.push({ codigo: key, value: null, alternative: clone(l) });
        }
      } else {
        entries.push({ codigo: key, value: clone(l), alternative: clone(l) });  // new here
      }
    });

    appendedLocal.forEach(function (p) {
      entries.push({ codigo: p.codigo, value: p, alternative: clone(p) });
    });

    // 3. A code given on this device (a new property, or a code change)
    //    that the site meanwhile used for another property: this device's
    //    property moves to the next free code, and old codes that belong
    //    to another property are dropped.
    var moved = {};
    entries.forEach(function (e) {
      ["value", "alternative"].forEach(function (side) {
        var p = e[side];
        if (!p) return;
        if (p.codigosAnteriores) {
          joinOldCodes(p, oldCodes(p).filter(function (c) {
            return !has(siteOwner, c) || siteOwner[c] === e.codigo;
          }));
        }
        if (!has(siteOwner, p.codigo) || siteOwner[p.codigo] === e.codigo) return;
        var from = p.codigo;
        if (!moved[from]) {
          moved[from] = nextFreeCode(from.slice(0, 3), taken);
          taken.push(moved[from]);
          renamed.push({ from: from, to: moved[from] });
        }
        e[side] = renameProperty(p, moved[from]);
      });
    });

    return { entries: entries, conflicts: conflicts, renamed: renamed };
  }

  /* choices: {codigo: "local" | "remote"}. Anything not chosen keeps
     the default (site). Returns the final property list. */
  function resolve(result, choices) {
    choices = choices || {};
    var out = [];
    result.entries.forEach(function (e) {
      var item = choices[e.codigo] === "local" ? e.alternative : e.value;
      if (item) out.push(clone(item));
    });
    return out;
  }

  // Which properties differ between two lists (to count unpublished changes);
  // a property whose code changed counts once
  function changedCodes(before, after) {
    var A = byCode(before);
    var B = mapOf(identify(after, A));
    return unionKeys(A, B).filter(function (code) { return !deepEqual(A[code], B[code]); });
  }

  return {
    deepEqual: deepEqual,
    nextFreeCode: nextFreeCode,
    merge: merge,
    resolve: resolve,
    changedCodes: changedCodes
  };
});
