# Sincronizar Poquito con tu correo (Supabase)

Con esto, tus tareas, tu frasco y tus ajustes son los mismos en el computador y en el teléfono.
Se hace **una sola vez** y es gratis. Toma unos 10 minutos.

## 1. Crear el proyecto
1. Entra a https://supabase.com y crea una cuenta gratis (puedes usar GitHub o tu correo).
2. Pulsa **New project** y completa el formulario:
   - **Project name:** `poquito`.
   - **Database password:** pulsa *Generate a password* y guárdala en tu gestor de contraseñas (Poquito no la usa, pero conviene tenerla).
   - **Region:** deja *Americas*, o abre la lista y elige *South America (São Paulo)* si aparece.
   - **Security:** deja marcado *Enable Data API* y *Automatically expose new tables*. *Enable automatic RLS* es opcional.
3. Espera un par de minutos a que termine de crearse.

## 2. Crear la tabla
1. En el menú de la izquierda abre **SQL Editor** y pulsa **New query**.
2. Pega esto y pulsa **Run**:

```sql
create table public.poquito_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.poquito_state enable row level security;

create policy "ver lo mio"      on public.poquito_state for select using (auth.uid() = user_id);
create policy "crear lo mio"    on public.poquito_state for insert with check (auth.uid() = user_id);
create policy "cambiar lo mio"  on public.poquito_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "borrar lo mio"   on public.poquito_state for delete using (auth.uid() = user_id);

-- permiso para que las personas con sesión iniciada usen la tabla (las reglas de arriba limitan a su propia fila)
grant select, insert, update, delete on public.poquito_state to authenticated;
```

Las cuatro reglas (políticas) hacen que **cada persona solo pueda ver y cambiar su propia fila**.

## 3. Dejar que las cuentas funcionen sin confirmar por correo
1. Ve a **Authentication → Sign In / Providers** (en algunas versiones: *Providers*) y abre **Email**.
2. Apaga **Confirm email** y guarda.

Así, al crear la cuenta puedes entrar de inmediato. Si prefieres dejarlo encendido, funciona igual,
pero tendrás que confirmar el correo con el enlace que te llegue antes de iniciar sesión.

## 4. Copiar los dos datos a Poquito
1. Ve a **Project Settings → API** (o *API Keys*).
2. Copia la **Project URL** (algo como `https://abcdefghij.supabase.co`).
3. Copia la clave pública: la que se llama **anon public** o **Publishable key**.
   **No copies** la `service_role` ni la `secret`: esas son privadas.
4. Pega los dos datos en el archivo de cada app:
   - Escritorio: `src/sync-config.js`
   - Android: `web/sync-config.js`

```js
window.POQUITO_SYNC = {
  url: 'https://abcdefghij.supabase.co',
  anonKey: 'eyJhbGciOi...',
};
```

5. Escritorio: cierra y vuelve a abrir Poquito. Android: sube los archivos a GitHub y descarga el APK nuevo.

**Ojo al actualizar:** cada zip nuevo trae `sync-config.js` vacío. Al copiar los archivos nuevos, **no reemplaces
ese archivo** (o vuelve a pegar tus datos después).

## 5. Usarlo
1. En la app: **Ajustes → Cuenta y sincronización → Crear cuenta** (correo y contraseña de 6 o más caracteres).
2. En el otro dispositivo: **Iniciar sesión** con el mismo correo y contraseña.
3. Desde ahí se sincroniza sola: al abrir la app, unos segundos después de cada cambio y cada minuto.
   Puedes usar **Sincronizar ahora** si quieres forzarlo.

## Cosas que conviene saber
- **Funciona sin internet.** Todo se guarda en el equipo; cuando vuelve la conexión se ponen al día.
- **Si dos equipos cambian lo mismo**, gana el cambio más reciente de esa tarea. Lo demás se conserva.
- **Cerrar sesión no borra tus tareas** de ese equipo.
- **Privacidad:** la conexión va cifrada y las reglas impiden que otras cuentas vean tus datos,
  pero el texto de tus tareas queda guardado en tu proyecto de Supabase sin cifrar por Poquito.
  Solo tú (dueño del proyecto) y Supabase pueden verlo. No pongas ahí nada que no quieras subir a la nube.
- **La clave `anon` puede ir en la app**: es pública por diseño y la protegen las reglas de la tabla.
  Nunca pegues la `service_role`.
- **Proyectos gratis de Supabase se pausan** si pasan una semana sin usarse. Si pasa, entra a tu panel
  y pulsa **Restore**; tus datos siguen ahí.
- **Todavía no hay "olvidé mi contraseña"** dentro de la app. Guárdala en tu gestor de contraseñas.
- **Widgets de Android:** si marcas una tarea desde un widget, se sincroniza la próxima vez que abras la app.
