# Susy Calendar — proyecto web

Organizador pessoal de contas, projetos, conteúdos, tarefas, ideias e datas.

Este es el mismo código y funcionalidad de siempre (React + Vite), empaquetado como un
proyecto web simple, listo para publicar en una URL. **No incluye PWA ni Capacitor/APK** —
eso queda para una etapa posterior si lo necesitas.

## Qué contiene

```
susy-calendar-web/
├── index.html          ← punto de entrada de Vite
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx         ← monta el componente App
    └── App.jsx           ← toda la aplicación (interfaz, lógica, estilos)
```

Los datos (cuentas, proyectos, contenidos, tareas, ideas, materiales) se guardan con
`localStorage`, en el navegador de cada persona que use la app — no hay backend ni base de
datos todavía (eso es la "segunda etapa" que mencionaste, no incluida aquí).

## Verificación que hice antes de entregarte este ZIP

- Revisé que estén todos los archivos necesarios para un proyecto Vite/React completo
  (`package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`).
- Verifiqué la sintaxis de `App.jsx` y `main.jsx` con el compilador de TypeScript (`tsc`), que
  sí tengo disponible en mi entorno sin necesitar internet — no encontró errores de sintaxis
  (JSX, llaves, paréntesis, etc.) en ninguna de las ~2000 líneas del proyecto.
- **Lo que no pude verificar aquí:** ejecutar `npm install` y `npm run build` de verdad. Mi
  entorno de trabajo tiene bloqueado el acceso a `registry.npmjs.org` (confirmé el bloqueo
  intentando instalar ahora mismo — devuelve error 403). Por eso no puedo descargar Vite,
  React o `lucide-react` aquí ni generar la carpeta `dist/` yo mismo.
- Las versiones que dejé en `package.json` (React 18.3.1, Vite 5.4, `lucide-react` 0.383.0,
  `@vitejs/plugin-react` 4.3.1) son versiones estables y compatibles entre sí — es la misma
  combinación que ya veníamos usando en este proyecto — pero la confirmación final de que
  `npm run build` corre sin errores depende de que lo ejecutes tú (o un servicio como Vercel/
  Netlify) con internet real. Si el build falla en tu máquina, pásame el error exacto y lo
  corrijo de inmediato.

## 1. Instalar dependencias

Necesitas [Node.js](https://nodejs.org) 18 o superior instalado.

```bash
npm install
```

## 2. Ejecutar en desarrollo (para probar en tu computadora)

```bash
npm run dev
```

Abre la URL que te muestre la terminal (normalmente `http://localhost:5173`).

## 3. Generar la build de producción

```bash
npm run build
```

Esto crea la carpeta `dist/` con los archivos estáticos finales (HTML, JS, CSS) — es lo que
subes a cualquier hosting para publicar la app.

Para revisar esa build antes de publicarla:

```bash
npm run preview
```

## 4. Publicar la aplicación y obtener una URL pública

Cualquiera de estas opciones sirve — todas son gratuitas para un proyecto personal:

**Opción A — Vercel (recomendada, muy simple)**
1. Crea una cuenta en https://vercel.com (puedes usar tu cuenta de GitHub).
2. Sube este proyecto a un repositorio de GitHub.
3. En Vercel: "Add New Project" → selecciona el repositorio → Vercel detecta que es un
   proyecto Vite automáticamente → "Deploy".
4. Te da una URL pública (`https://tu-proyecto.vercel.app`) en menos de un minuto.

**Opción B — Netlify Drop (sin cuenta, sin repositorio)**
1. Corre `npm run build` en tu computadora.
2. Entra a https://app.netlify.com/drop
3. Arrastra la carpeta `dist/` (la que generó el build) a esa página.
4. Te da una URL pública al instante.

**Opción C — GitHub Pages / Cloudflare Pages**
Funcionan igual: subes el repositorio, conectas el servicio, y configuras el comando de build
como `npm run build` y la carpeta de salida como `dist`.

## Siguientes etapas (no incluidas todavía, a propósito)

- Sincronización entre dispositivos / base de datos.
- Integración con Google Drive.
- PWA (instalar como app) y APK para Android — ya preparamos esa configuración antes por
  separado; si la necesitas de nuevo para este proyecto, dímelo y la vuelvo a incorporar.
