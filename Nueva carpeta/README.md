# Dron de Exploración AR - Proyecto Completado

Este es tu proyecto de Realidad Aumentada listo para producción, exportado con AR WebApp Studio.

## Archivos Incluidos
- `index.html`: El archivo principal con la escena de AR configurable, capas de material y scripts interactivos.
- `marleyblend.glb`: Tu modelo 3D GLB con soporte optimizado para animaciones integradas.


## Cómo Ejecutar y Probar de Forma Local

Las tecnologías de Realidad Aumentada Web (como WebXR, MindAR y AR.js) **requieren** acceso seguro de cámara (HTTPS) o estar en localhost para funcionar.

### Opción A: Servidor Local Rápido (Recomendado)
Si tienes Node.js o Python instalado en tu máquina, abre tu terminal en esta carpeta y ejecuta:

**Usando Node.js (con npx):**
```bash
npx serve .
```
o
```bash
npx live-server
```

**Usando Python:**
```bash
python -m http.server 8000
```
Luego, abre tu navegador favorito en: `http://localhost:8000` (o la dirección que indique el comando).

---

### Opción B: Despliegue en la Web (HTTPS Gratis)
Sube estos archivos directamente para probarlo en tu teléfono móvil:
1. **GitHub Pages**: Crea un repositorio en GitHub, sube estos archivos, habilita GitHub Pages en configuración y listo.
2. **Netlify / Vercel**: Arrastra y suelta esta carpeta en su panel web de carga rápida.
3. Abre la URL en tu móvil con confianza (la URL debe iniciar con `https://`).

¡Disfruta de tu experiencia de Realidad Aumentada!
