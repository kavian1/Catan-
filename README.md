# Hexaterra

Juego de mesa multijugador de colonización y comercio sobre un tablero de hexágonos, pensado para jugar
con amigos **cada uno desde su móvil**. Funciona en cualquier navegador, sin instalar nada.

- 2 a 4 jugadores en el tablero normal (19 terrenos) y 5 o 6 en el tablero ampliado (30 terrenos).
- Tablero aleatorio en cada partida (los 6 y 8 nunca quedan juntos) con 9 u 11 puertos.
- Reglas completas: colocación inicial en serpiente, producción, el 7 con descartes, bandido y robo,
  comercio con jugadores, banco y puertos (4:1, 3:1, 2:1), cartas de progreso (Soldado, Punto de victoria,
  Constructor de caminos, Abundancia, Monopolio), Ruta más larga, Ejército más grande, límite de piezas,
  escasez del banco y fase de construcción especial para 5–6 jugadores.
- Puntos para ganar configurables, revancha con los mismos jugadores, código QR para unirse,
  reconexión automática si se cierra la página o el móvil se bloquea.

## Cómo funciona

El servidor (una función de Netlify) es el único que conoce el estado real de la partida: tira los dados,
baraja las cartas y valida cada jugada. Cada móvil solo recibe lo que su jugador puede ver (las cartas de los
demás están ocultas). Las partidas se guardan en **Netlify Blobs** con escrituras condicionales, así que dos
jugadores actuando a la vez nunca se pisan.

```
public/            → la web (HTML, CSS, JS sin compilar)
  engine.js        → reglas del juego (compartidas por web y servidor)
  board.js         → dibujo del tablero en SVG, zoom y arrastre
  app.js           → interfaz y comunicación con el servidor
src/handler.js     → API: crear sala, unirse, estado, acciones
netlify/functions/api.mjs → función de Netlify que sirve /api/*
dev-server.mjs     → servidor local para probar sin Netlify
test/              → simulación de cientos de partidas y pruebas de concurrencia
```

## Publicarlo en Netlify

> ⚠️ El sistema de arrastrar y soltar la carpeta (Netlify Drop) **no sirve**: solo publica archivos estáticos
> y el juego necesita la función del servidor. Usa una de estas dos opciones.

### Opción A — con GitHub (recomendada)

1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
3. Deja los ajustes como vienen (el archivo `netlify.toml` ya indica la carpeta `public` y las funciones).
   No hace falta comando de build.
4. Pulsa **Deploy**. Netlify instala `@netlify/blobs`, publica la función y te da una URL tipo
   `https://tu-sitio.netlify.app`.

Cada vez que subas cambios a GitHub se vuelve a publicar solo.

### Opción B — con la línea de comandos

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

La primera vez te preguntará si quieres crear un sitio nuevo; contesta que sí.

## Jugar

1. Abre la web, escribe tu nombre y pulsa **Crear partida**.
2. Comparte el enlace (botón **Compartir enlace**, va directo a WhatsApp en el móvil) o deja que tus amigos
   escaneen el código QR. También pueden entrar escribiendo el código de 4 letras.
3. Cada uno elige color. El anfitrión ajusta los puntos para ganar y pulsa **Empezar partida**.
4. En tu turno: toca **Tirar dados**, luego **Construir**, **Comerciar** o **Cartas**, y **Terminar turno**.
   Para colocar piezas toca un sitio marcado en el tablero y pulsa **Confirmar**.
   Puedes ampliar el tablero con dos dedos (o la rueda del ratón) y moverlo arrastrando.

Consejo: en el móvil, «Añadir a pantalla de inicio» la abre a pantalla completa como una app.
La pantalla se mantiene encendida durante la partida (se puede desactivar en el menú ☰).

## Probarlo en tu ordenador

```bash
npm install
npm run dev
```

Abre `http://localhost:8888`. El servidor también muestra la dirección de tu red local
(por ejemplo `http://192.168.1.20:8888`): tus amigos conectados a la misma WiFi pueden jugar desde ahí sin
publicar nada. Para probar varios jugadores en un solo ordenador, abre cada uno en una pestaña distinta.

Pruebas automáticas (simulan 300 partidas completas y comprueban accesos simultáneos):

```bash
npm test
```

## Consumo en el plan gratuito de Netlify

Cada móvil con la partida abierta y visible consulta el servidor aproximadamente una vez por segundo;
cuando la pantalla se apaga o la pestaña queda en segundo plano deja de hacerlo. Una partida de 4 personas
durante una hora y media son unas 15.000–20.000 peticiones a la función, holgadamente dentro de lo normal
para jugar con amigos, pero si ves que te acercas al límite de tu plan, cierra la pestaña al terminar.
