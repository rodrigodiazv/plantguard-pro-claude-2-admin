# Placa "La Cueva" (piloto 1 m²)
ESP32 + DHT22 + sensor capacitivo de sustrato + módulo de 4 relés (luz, ventilador, calefactor, riego).
1. Instale en el IDE de Arduino: placa "ESP32 Dev Module"; librerías "DHT sensor library" y "ArduinoJson".
2. Copie `secrets.h.example` a `secrets.h` y rellénelo (WiFi, clave de ingesta que se ve en el panel, y los `_id` de cada equipo de la tabla Dispositivos).
3. **Pruebe primero con los relés SIN carga conectada.** Compruebe: todo apagado al arrancar; la luz sigue el horario; el calefactor no se enciende por encima de 28 °C; un riego nunca dura más de 90 s.
4. Flujo de órdenes: el Grow Agent propone → Rodrigo autoriza en el panel (vista "Órdenes") → la placa la recoge en ≤ 60 s, la ejecuta y confirma.
Estado: código escrito sin hardware real; NO probado en una placa. Calibre el sensor de sustrato (valor en seco/en agua).
