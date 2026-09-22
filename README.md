# OCsheets — Free Edition

Esta es una versión de prueba, de código abierto y sin capa social. La app completa, funcionando en vivo (con comunidad, perfiles públicos, likes y más), está en [merry-cocada-027ef3.netlify.app](https://merry-cocada-027ef3.netlify.app).

OCsheets es una app para gestionar personajes originales (OCs), parecida a [refsheet.net](https://refsheet.net): fichas con foto de perfil, banner, atributos personalizables, notas, galería de imágenes, historias vinculadas y organización por grupos. Funciona desde cualquier navegador (PC, celular, tablet) y se sincroniza entre dispositivos.

Esta edición gratuita cubre todo lo básico para gestionar tus propios personajes: no tiene perfiles públicos, comunidad ni nada que dependa de un servicio de pago. Corre sobre tu propia cuenta de Supabase, que es gratis.

## Qué incluye

- Fichas de personaje: nombre, especie, avatar, banner, atributos personalizados ("OC Expansión"), paleta de colores, notas, "sobre el personaje", gustos/disgustos y galería.
- Grupos libres, creados por ti; un personaje puede pertenecer a varios a la vez (arrastrar y soltar, o casillas).
- Historias: un apartado aparte para texto largo, vinculable a uno o varios personajes.
- Zoom en las fotos, con navegación entre imágenes y atajos de teclado.
- Login con correo, Google o Facebook, y recuperación de contraseña.
- Guardado automático, más un botón de guardado manual por si acaso.
- Diseño responsive, pensado para usarse igual en celular que en PC.

## Stack

Frontend en HTML/CSS/JavaScript puro, sin frameworks ni build step. El backend es [Supabase](https://supabase.com) (Postgres, Auth, Storage). Se despliega como sitio estático en cualquier hosting gratuito — Netlify, Vercel, GitHub Pages.

## Puesta en marcha

### 1. Proyecto en Supabase

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Ve a SQL Editor → New query, pega el contenido de [`schema.sql`](./schema.sql) y dale Run.
3. En Authentication → Providers, confirma que Email esté activo. Si quieres login social, activa Google y/o Facebook ahí mismo (necesitas credenciales OAuth de Google Cloud Console / Facebook Developers, ambas gratis).

### 2. Configurar la app

```bash
cp config.example.js config.js
```

Edita `config.js` con tu Project URL y tu Publishable key (Project Settings → Data API / API Keys en el panel de Supabase).

### 3. Probar en local

No funciona con doble clic, necesita un mini-servidor:

```bash
python -m http.server 8080
# o en VS Code: clic derecho en index.html → "Open with Live Server"
```

Abre `http://localhost:8080`, regístrate con tu correo y listo.

### 4. Publicar

Arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop), o conéctala como repo en Netlify/Vercel para poder actualizarla después. En segundos tienes una URL pública para usar desde cualquier dispositivo.

## Licencia

[MIT](./LICENSE) — úsala, modifícala, compártela.

## Autor

Nicolás Torrejón.
