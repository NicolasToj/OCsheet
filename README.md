# 🗂️ OCsheets — Free Edition

> **Esta es una versión de prueba, de código abierto y sin capa social.**
> La app completa, funcionando en vivo (con Comunidad, perfiles públicos, likes y más) está en:
> **👉 [https://merry-cocada-027ef3.netlify.app](https://merry-cocada-027ef3.netlify.app)**

Una app tipo [refsheet.net](https://refsheet.net) para gestionar tus personajes originales (OCs): fichas con foto de perfil, banner, atributos personalizables, notas, galería de imágenes, historias vinculadas y organización por grupos. Funciona en cualquier navegador — PC, celular, tablet — sincronizada en vivo entre todos tus dispositivos.

Esta es la **edición gratuita y de código abierto**: 100% funcional para gestionar tus propios personajes, sin ninguna capa social (sin perfiles públicos, sin comunidad, sin dependencias de pago). La corres en tu propia cuenta de Supabase, gratis.

## ✨ Funciones

- 🖼️ **Fichas de personaje completas** — nombre, especie, avatar, banner, atributos personalizados ("OC Expansión"), paleta de colores, notas, "sobre el personaje", gustos/disgustos, y galería.
- 📁 **Grupos libres** — tú los creas, un personaje puede pertenecer a varios a la vez (arrastrar y soltar, o casillas).
- 📖 **Historias** — apartado propio para textos largos, vinculables a uno o varios personajes.
- 🔍 **Zoom en las fotos** — visor con navegación entre imágenes y atajos de teclado.
- 🔐 **Login con correo, Google o Facebook**, recuperación de contraseña incluida.
- 💾 **Guardado automático** + botón de guardado manual en cada sección, por si acaso.
- 📱 **Responsive** — pensada para usarse igual de bien en el celular que en la compu.

## 🧱 Stack

Frontend 100% en HTML / CSS / JavaScript puro (sin frameworks ni build step) + [Supabase](https://supabase.com) como backend (Postgres, Auth, Storage). Se despliega como sitio estático en cualquier hosting gratuito (Netlify, Vercel, GitHub Pages).

## 🚀 Puesta en marcha

### 1. Crear el proyecto en Supabase (gratis)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Ve a **SQL Editor → New query**, pega el contenido de [`schema.sql`](./schema.sql) y dale **Run**.
3. En **Authentication → Providers**, confirma que **Email** esté activo. Si quieres login social, activa **Google** y/o **Facebook** ahí mismo (necesitas crear credenciales OAuth en Google Cloud Console / Facebook Developers — son gratis).

### 2. Configurar la app

```bash
cp config.example.js config.js
```

Edita `config.js` con tu **Project URL** y tu **Publishable key** (Project Settings → Data API / API Keys en el panel de Supabase).

### 3. Probar en local

Necesitas servirlo con un mini-servidor (no funciona con doble clic):

```bash
python -m http.server 8080
# o, en VS Code: clic derecho en index.html → "Open with Live Server"
```

Abre `http://localhost:8080`, regístrate con tu correo, y listo.

### 4. Publicar

Arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop) (o conéctala como repo en Netlify/Vercel para poder actualizarla después). En segundos tienes una URL pública para usar desde cualquier dispositivo.

## 📄 Licencia

[MIT](./LICENSE) — úsala, modifícala, compártela.

## 🙋 Créditos

Hecho por [Kasumoru](https://x.com/kasumoruTwitch).
