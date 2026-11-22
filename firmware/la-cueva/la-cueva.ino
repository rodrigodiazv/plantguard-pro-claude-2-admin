// PlantGuard Pro — placa "La Cueva" (ESP32), piloto de 1 m².
// Hace 3 cosas: (1) lee sensores y los envía al panel cada 10 min, (2) pregunta al panel cada 60 s si Rodrigo
// ha autorizado alguna orden y la ejecuta, (3) aplica SIEMPRE los límites de seguridad en local, aunque falle internet.
//
// Librerías (Gestor de librerías de Arduino): "DHT sensor library" (Adafruit), "ArduinoJson" (Benoit Blanchon).
// Placa: ESP32 Dev Module. Copie secrets.h.example a secrets.h y rellénelo.
//
// AVISO PILOTO: usa HTTPS sin verificar el certificado del servidor (setInsecure) para no tener que mantener
// certificados en la placa. El tráfico va cifrado pero no se autentica el servidor. Mejora pendiente: fijar el
// certificado raíz.  Pruebe SIEMPRE primero con los relés desconectados de la carga.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include "secrets.h"

// ---- Pines (ajuste a su cableado) ----
#define PIN_DHT        4    // DHT22: temperatura y humedad del aire
#define PIN_SUELO      34   // sensor capacitivo de humedad del sustrato (analógico)
#define PIN_LUZ        16   // relés (módulo activo en BAJO: LOW = encendido)
#define PIN_VENT       17
#define PIN_CALEF      18
#define PIN_RIEGO      19
#define RELE_ON  LOW
#define RELE_OFF HIGH

// ---- LÍMITES DE SEGURIDAD (viven aquí, no dependen de internet) ----
const float TEMP_CALEFACTOR_MAX = 28.0;   // por encima: calefactor SIEMPRE apagado
const float TEMP_VENT_AUTO      = 27.0;   // por encima: ventilador se enciende solo
const float HUM_VENT_AUTO       = 70.0;   // por encima: ventilador se enciende solo
const int   RIEGO_MAX_S         = 90;     // tope duro por riego (el panel permite hasta 120)
const unsigned long RIEGO_ESPERA_MS = 30UL * 60UL * 1000UL;  // mínimo entre riegos
const int   LUZ_HORA_ON  = 6;             // horario de luz por defecto: 18 h (06:00–24:00)
const int   LUZ_HORA_OFF = 24;            // 24 = medianoche
const char* TZ_INFO = "CET-1CEST,M3.5.0,M10.5.0/3";  // Granada / Suiza

DHT dht(PIN_DHT, DHT22);
float temp = NAN, hum = NAN;
int suelo = 0;
bool luzOn = false, ventOverride = false, calefOverride = false;
unsigned long riegoFin = 0, ultimoRiego = 0, tLectura = 0, tOrdenes = 0;
int luzOverrideHora = -1;  // hora en la que se fijó una orden manual de luz (se anula en el siguiente cambio de horario)

void rele(int pin, bool on) { digitalWrite(pin, on ? RELE_ON : RELE_OFF); }

bool postJson(const String& path, const String& body, String* resp = nullptr) {
  WiFiClientSecure c; c.setInsecure();
  HTTPClient h; h.setTimeout(8000);
  if (!h.begin(c, String("https://") + PANEL_HOST + path)) return false;
  h.addHeader("Content-Type", "application/json"); h.addHeader("X-Ingest-Key", INGEST_KEY);
  int code = h.POST(body);
  if (resp) *resp = h.getString();
  h.end();
  return code == 200;
}

void enviar(const char* id, float v, const char* unidad, const char* tipo) {
  if (isnan(v)) return;
  String b = String("{\"action\":\"ingest\",\"device_id\":\"") + id + "\",\"valor\":" + String(v, 1) +
             ",\"unidad\":\"" + unidad + "\",\"tipo_sensor\":\"" + tipo + "\"}";
  postJson("/api/ops-data", b);
}

void leerSensores() {
  temp = dht.readTemperature(); hum = dht.readHumidity();
  suelo = analogRead(PIN_SUELO);  // calibrar: valor en seco vs. en agua
}

void aplicarSeguridad() {
  struct tm t; bool horaOk = getLocalTime(&t, 50);
  // Luz: horario local. Una orden manual dura hasta el próximo cambio del horario.
  if (horaOk) {
    bool deberia = (t.tm_hour >= LUZ_HORA_ON && t.tm_hour < LUZ_HORA_OFF);
    if (luzOverrideHora >= 0 && t.tm_hour != luzOverrideHora && (t.tm_hour == LUZ_HORA_ON || t.tm_hour == LUZ_HORA_OFF % 24)) luzOverrideHora = -1;
    if (luzOverrideHora < 0) luzOn = deberia;
  }
  rele(PIN_LUZ, luzOn);
  // Calefactor: solo con orden y con sensor sano y por debajo del máximo.
  bool sensorOk = !isnan(temp);
  rele(PIN_CALEF, calefOverride && sensorOk && temp < TEMP_CALEFACTOR_MAX);
  // Ventilador: orden manual o automático por temperatura/humedad.
  bool ventAuto = sensorOk && (temp > TEMP_VENT_AUTO || (!isnan(hum) && hum > HUM_VENT_AUTO));
  rele(PIN_VENT, ventOverride || ventAuto);
  // Riego: termina solo al cumplirse el tiempo (tope duro).
  if (riegoFin && millis() >= riegoFin) { rele(PIN_RIEGO, false); riegoFin = 0; }
}

String ejecutar(const String& accion, const String& valor, bool* ok) {
  *ok = true;
  if (accion == "luz")        { luzOn = (valor == "on"); struct tm t; luzOverrideHora = getLocalTime(&t, 50) ? t.tm_hour : 0; return "luz " + valor; }
  if (accion == "ventilador") { ventOverride = (valor == "on"); return "ventilador " + valor; }
  if (accion == "calefactor") { calefOverride = (valor == "on"); return "calefactor " + valor + " (limitado por temperatura)"; }
  if (accion == "riego") {
    int s = valor.toInt();
    if (s < 1) { *ok = false; return "segundos no validos"; }
    if (s > RIEGO_MAX_S) s = RIEGO_MAX_S;
    if (ultimoRiego && millis() - ultimoRiego < RIEGO_ESPERA_MS) { *ok = false; return "rechazado: riego reciente (espera de seguridad)"; }
    rele(PIN_RIEGO, true); riegoFin = millis() + (unsigned long)s * 1000UL; ultimoRiego = millis();
    return "riego " + String(s) + " s";
  }
  *ok = false; return "accion desconocida";
}

void pedirOrdenes() {
  const char* ids[] = { ID_LUZ, ID_VENTILADOR, ID_CALEFACTOR, ID_RIEGO };
  for (const char* id : ids) {
    WiFiClientSecure c; c.setInsecure(); HTTPClient h; h.setTimeout(8000);
    if (!h.begin(c, String("https://") + PANEL_HOST + "/api/ops-data?comandos=1&device_id=" + id)) continue;
    h.addHeader("X-Ingest-Key", INGEST_KEY);
    int code = h.GET(); String r = h.getString(); h.end();
    if (code != 200) continue;
    JsonDocument d; if (deserializeJson(d, r)) continue;
    for (JsonObject o : d["ordenes"].as<JsonArray>()) {
      bool ok; String res = ejecutar(o["accion"].as<String>(), o["valor"].as<String>(), &ok);
      String b = String("{\"action\":\"ack\",\"id\":\"") + o["id"].as<String>() + "\",\"device_id\":\"" + id +
                 "\",\"ok\":" + (ok ? "true" : "false") + ",\"resultado\":\"" + res + "\"}";
      postJson("/api/ops-data", b);
    }
  }
}

void setup() {
  Serial.begin(115200);
  int pines[] = { PIN_LUZ, PIN_VENT, PIN_CALEF, PIN_RIEGO };
  for (int p : pines) { pinMode(p, OUTPUT); digitalWrite(p, RELE_OFF); }  // arranca TODO apagado
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  unsigned long now = millis();
  if (now - tLectura > 10UL * 60UL * 1000UL || tLectura == 0) {
    tLectura = now; leerSensores();
    if (WiFi.status() == WL_CONNECTED) {
      enviar(ID_SENSOR_AIRE, temp, "°C", "temperatura");
      enviar(ID_SENSOR_AIRE, hum, "%", "humedad");
      enviar(ID_SENSOR_SUST, (float)suelo, "raw", "humedad_sustrato");
    }
  }
  if (WiFi.status() == WL_CONNECTED && now - tOrdenes > 60UL * 1000UL) { tOrdenes = now; pedirOrdenes(); }
  if (now % 5000 < 50) leerSensores();   // la seguridad usa una lectura reciente
  aplicarSeguridad();
  delay(50);
}
