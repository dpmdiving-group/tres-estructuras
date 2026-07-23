/* ============================================================
   TRES ESTRUCTURAS — Configuracion
   UNICO lugar donde viven el numero de WhatsApp y el dominio.
   El numero NUNCA se imprime ni se codifica en un QR (spec §9.2).
   ============================================================ */

const CONFIG = {
  // Formato: 54 + 9 + codigo de area sin 0 + numero sin 15.
  // Ej. celular de AMBA: "5491112345678". COMPLETAR con el numero real.
  whatsapp: "5491156531063",

  // Dominio de produccion, sin barra final. Se usa para QR, sitemap y open graph.
  dominio: "https://tresestructuras.com",

  // Telefono visible en el header (formato legible)
  telefonoVisible: "11 5653-1063",

  nombre: "Tres Estructuras",

  // Zonas operadas: prefijo de codigo -> etiqueta
  zonas: {
    "QLM": "Quilmes",
    "BER": "Bernal",
    "AVE": "Avellaneda",
    "LAN": "Lanús",
    "LOM": "Lomas"
  },

  // Diccionario de amenities: clave -> etiqueta legible (spec §6)
  amenities: {
    pileta: "Pileta",
    parrilla: "Parrilla",
    cochera: "Cochera",
    patio: "Patio",
    balcon: "Balcón",
    terraza: "Terraza",
    jardin: "Jardín",
    seguridad: "Seguridad",
    sum: "SUM",
    gimnasio: "Gimnasio",
    ascensor: "Ascensor",
    lavadero: "Lavadero",
    aire: "Aire acondicionado",
    calefaccion: "Calefacción",
    amoblado: "Amoblado",
    mascotas: "Acepta mascotas",
    apto_credito: "Apto crédito",
    apto_profesional: "Apto profesional"
  }
};
