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

      if (deepEqual(l, r)) value = r;
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
                 value = default (site) choice, alternative = "mine".
                 null means "the property is not in the list".
       conflicts [{codigo, type, fields?, local, remote}]
                 type: "fields" | "deleted_on_site" | "deleted_here"
       renamed   [{from, to}] new properties whose code had already
                 been used on the site; they got the next free code.
  */
  function merge(base, local, remote) {
    var hasBase = Array.isArray(base);
    var B = byCode(base);
    var L = byCode(local);
    var R = byCode(remote);

    var entries = [];
    var conflicts = [];
    var renamed = [];
    var appendedLocal = [];

    var taken = Object.keys(B).concat(Object.keys(L), Object.keys(R));

    // 1. Everything the site has, in the site's order
    (remote || []).forEach(function (r) {
      var code = r.codigo;
      var l = L[code];
      var b = B[code];
      var inBase = hasBase && Object.prototype.hasOwnProperty.call(B, code);

      if (l) {
        if (!inBase && hasBase && !deepEqual(l, r)) {
          // Both sides created a property with the same code
          entries.push({ codigo: code, value: clone(r), alternative: clone(r) });
          var newCode = nextFreeCode(code.slice(0, 3), taken);
          taken.push(newCode);
          renamed.push({ from: code, to: newCode });
          appendedLocal.push(renameProperty(l, newCode));
          return;
        }
        var res = mergeFields(inBase ? b : null, l, r);
        if (res.conflicts.length) {
          conflicts.push({ codigo: code, type: "fields", fields: res.conflicts, local: clone(l), remote: clone(r) });
          entries.push({ codigo: code, value: res.merged, alternative: res.alternative });
        } else {
          entries.push({ codigo: code, value: res.merged, alternative: res.merged });
        }
        return;
      }

      // Not on this device anymore
      if (inBase) {
        if (deepEqual(r, b)) {
          entries.push({ codigo: code, value: null, alternative: null });  // deleted here
        } else {
          // Deleted here, but someone changed it on the site meanwhile
          conflicts.push({ codigo: code, type: "deleted_here", local: null, remote: clone(r) });
          entries.push({ codigo: code, value: clone(r), alternative: null });
        }
      } else {
        // New on the site (or no base to tell): keep it
        entries.push({ codigo: code, value: clone(r), alternative: clone(r) });
      }
    });

    // 2. What only this device has
    (local || []).forEach(function (l) {
      var code = l.codigo;
      if (R[code]) return;
      var inBase = hasBase && Object.prototype.hasOwnProperty.call(B, code);
      if (inBase) {
        if (deepEqual(l, B[code])) {
          entries.push({ codigo: code, value: null, alternative: null });  // deleted on the site
        } else {
          // Deleted on the site, but changed here meanwhile
          conflicts.push({ codigo: code, type: "deleted_on_site", local: clone(l), remote: null });
          entries.push({ codigo: code, value: null, alternative: clone(l) });
        }
      } else {
        entries.push({ codigo: code, value: clone(l), alternative: clone(l) });  // new here
      }
    });

    appendedLocal.forEach(function (p) {
      entries.push({ codigo: p.codigo, value: p, alternative: clone(p) });
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

  // Which properties differ between two lists (to count unpublished changes)
  function changedCodes(before, after) {
    var A = byCode(before);
    var B = byCode(after);
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
