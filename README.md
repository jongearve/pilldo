# Poquito

*Una cosa a la vez.*

Tareas pequeñas en forma de pastillas (cada tarea es una pastilla), siempre a mano desde la bandeja de Windows.

## Cómo usarla

1. Instala Node.js (una sola vez): https://nodejs.org  (versión LTS)
2. Doble clic en `iniciar.bat`. La primera vez tarda un minuto en instalarse.
3. Busca el ícono de la pastilla junto al reloj (si no lo ves, está en la flecha ^).

Para tener un instalador normal de Windows (y que se abra al iniciar el PC), haz doble clic en `crear-instalador.bat`. El instalador queda en la carpeta `dist`.

## Qué hace

- **Cuenta y sincronización** (Ajustes): con un correo y una contraseña, tus tareas, tu frasco y tus ajustes son los mismos en el computador y en el teléfono. Funciona sin internet y se pone al día al volver la conexión. Se configura una sola vez con un proyecto gratis de Supabase: mira `SUPABASE.md`.

- **Cupo del día**: cada pastilla tiene un tamaño (chica = 1, mediana = 2, grande = 3; tres puntitos a su derecha) y tú eliges tu energía del día (baja = 4, media = 7, alta = 10). Una barra muestra cuánto de tu día está ocupado. Si se llena, Poquito te lo dice con calma y puedes pasar lo que sobra a mañana con un clic (con "Deshacer"). Se cambia el tamaño con el botón de puntitos al pasar el cursor por una pastilla, o antes de crearla con los puntitos del campo de escribir. Se puede apagar en Ajustes.
- **Frasco de pastillas** (ícono de frasco arriba): cada tarea que terminas suma una pastilla. No hay rachas ni reinicios: desmarcar una tarea la saca del frasco, pero borrarla no. Muestra el total, el día y los últimos 7 días.
- **Movimiento** (Ajustes: Ninguno, Suave o Animado; se respeta si Windows tiene los efectos de animación apagados): las pastillas se deslizan a su nuevo lugar, el color se funde y el check se dibuja al cambiar de estado, las borradas se desvanecen, el panel entra con suavidad. En *Animado* además: la pastilla completada vuela al frasco, el día cambia con un deslizamiento, las pastillas caen dentro del frasco y el total cuenta hacia arriba.
- **Al terminar una tarea** (Ajustes): nada más, una frase amable, pastillas de celebración o un minijuego de 15 segundos sin puntos. Siempre con "Deshacer".

- **Chip en la barra de tareas**: junto a la bandeja aparece una pastilla con tu tarea actual (la que está en proceso, o la siguiente por hacer). Clic en el círculo (al pasar el cursor muestra un check) la marca como hecha y pasa a la siguiente; clic en el resto abre y cierra el panel; clic derecho permite marcarla como hecha, empezarla (en proceso) o devolverla a por hacer. Para moverlo, arrástralo desde el asa de puntos que aparece a su izquierda al pasar el cursor. Se activa o desactiva en Ajustes. Con la barra de tareas oculta automáticamente no funciona bien.

- **Clic en el ícono** o **Ctrl + Alt + T**: abre y cierra el panel.
- **Escribe y Enter**: crea una pastilla para el día que estás viendo.
- **Clic en el círculo** de una pastilla: Por hacer → En proceso → Hecho → Por hacer.
- **Arrastrar y soltar**: arrastra una pastilla para ordenarla dentro de su sección, o suéltala en otra sección (En proceso, Por hacer, Hecho) para cambiar su estado; también puedes soltarla sobre las flechas ‹ › para pasarla al día anterior o siguiente. Con teclado: Alt + ↑ / ↓. La primera pastilla de En proceso es la que muestra el chip de la barra.
- **Al pasar el cursor** sobre una pastilla: repetir cada día, pasar al día siguiente, editar, eliminar. Doble clic en el texto también edita.
- **‹ ›** en la cabecera: ver ayer, mañana o cualquier día. Clic en el título para volver a hoy.
- **Lo que no terminaste pasa solo a hoy**, sin marcas de "atrasado".
- **Pastillas que se repiten cada día**: para rutinas (medicación, agua, ducha).
- **Fijar en el escritorio** (chincheta): el panel se vuelve una pegatina flotante, siempre visible, que se puede arrastrar. Muestra solo lo que está en proceso y por hacer.
- **Avisos** (Ajustes): resumen a la hora que elijas y recordatorio suave de lo que está en proceso, entre las 08:00 y las 21:00. Sin sonido por defecto.

Tus datos se guardan solo en tu PC: `%APPDATA%\Poquito\poquito.json`.
