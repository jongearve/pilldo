# Poquito para Android

*Una cosa a la vez.* La misma app de escritorio, en el celular.

- Tareas en pastillas: **Por hacer**, **En proceso**, **Hecho**, por día.
- **Desliza** una tarea a la derecha para marcarla como hecha, o a la izquierda para pasarla a mañana.
- **Mantén pulsada** una tarea para moverla; suéltala en otra sección para cambiar su estado.
- **Toca** una tarea para ver sus opciones (estado, editar, repetir cada día, eliminar).
- **Tira de 7 días** bajo el título: toca un día para verlo, desliza para cambiar de semana, y suelta una tarea sobre un día para pasarla ahí. Un puntito marca los días con tareas.
- **Widgets en la pantalla de inicio** (mantén pulsada la pantalla de inicio → Widgets → Poquito):
  - *Tarea actual*: un chip con la tarea en proceso y un círculo para marcarla como hecha.
  - *Pegatina de hoy*: hasta 4 pastillas con su círculo.
- Aviso de la mañana y recordatorio suave de lo que está en proceso. Funcionan sin internet.
- Lo que no terminaste pasa solo a hoy, sin marcas de "atrasado".
- **Cuenta y sincronización** (Ajustes): con un correo y contraseña, tus tareas son las mismas en el teléfono y en el computador. Se configura una vez con Supabase: mira `SUPABASE.md`. Sin cuenta, tus datos quedan solo en el teléfono.

## Instalar en tu teléfono (sin Android Studio)

Necesitas una cuenta gratis en https://github.com

1. Crea un repositorio nuevo **privado** en GitHub.
2. Sube **todo el contenido** de esta carpeta (incluida la carpeta oculta `.github`).
   Lo más fácil es GitHub Desktop, o en la terminal:
   ```
   git init
   git add .
   git commit -m "Poquito Android"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
3. En GitHub abre la pestaña **Actions**. El trabajo "Compilar APK de Poquito" arranca solo
   (o púlsalo y elige **Run workflow**). Tarda unos 5 a 10 minutos.
4. Cuando termine, entra en esa ejecución y descarga **Poquito-APK** (un zip con `app-debug.apk`).
5. Pasa el `.apk` al teléfono, ábrelo y acepta "instalar apps de esta fuente".
6. Abre Poquito y **permite los avisos** cuando te lo pida.

## Instalar con Android Studio

1. Instala Node.js 22 o superior y Android Studio.
2. En esta carpeta: `npm install` y luego `npm run android`. Se abre Android Studio.
3. Conecta el teléfono con "Depuración USB" activada (o usa un emulador) y pulsa **Run**.

## Cambiar la interfaz

La interfaz está en la carpeta `web/`. Después de cambiarla, ejecuta `npm run sync` para
copiarla al proyecto de Android y vuelve a compilar.

## Notas

- Desde la versión 1.1 el APK se firma siempre con la misma llave (`android/app/poquito-debug.keystore`),
  así las versiones nuevas se instalan encima de las anteriores sin borrar tus tareas.
- Es un APK de depuración: sirve para uso personal. Para publicar en Google Play hay que
  firmarlo (lo vemos cuando llegue el momento).
- En algunos teléfonos (Xiaomi, Samsung, etc.) el ahorro de batería puede retrasar los avisos.
  Si pasa, en Ajustes del teléfono → Apps → Poquito → Batería, elige "Sin restricciones".
