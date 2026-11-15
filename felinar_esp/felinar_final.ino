// =====================================================================
//  FELINAR v7.2 - PROMPT CONTEXTUAL + touch cu auto-calibrare corecta
//
//  FIX fata de v7.1:
//   - calibreazaTouch() foloseste MAX (resting) nu MEAN (contaminat de zgomot)
//   - Auto-calibrare runtime /4 in loc de /19 (converge in ~200ms)
//   - Praguri mai permisive: IN = 75% baza, OUT = 90% baza
//   - Plafoane de siguranta ca sa nu devina insensibil
// =====================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <SPIFFS.h>
#include <AudioFileSourceSPIFFS.h>
#include <AudioGeneratorMP3.h>
#include <AudioOutput.h>
#include <math.h>
#include "fraza.h"
#include "hello.h"

// ====== WI-FI & BEC ======
const char* WIFI_SSID = "NoName (2)";
const char* WIFI_PASS = "Mario333";
const uint16_t WIZ_PORT = 38899;
const char* IP_MANUAL = "";

// ====== BACKEND ======
const char* BACKEND_POLL_URL   = "http://68.221.133.34/iot/unirii/poll";
const char* BACKEND_ACK_URL    = "http://68.221.133.34/iot/unirii/ack";
const char* BACKEND_PROMPT_URL = "http://68.221.133.34/iot/unirii/prompt";
const unsigned long POLL_INTERVAL_MS = 4000;

// ====== AUDIO ======
#define I2S_PORT   I2S_NUM_0
#define PIN_BCLK   26
#define PIN_LRC    25
#define PIN_DIN    22
#define CHUNK      256

float VOLUM       = 2.5f;
float STREAM_GAIN = 2.5f;

// ====== TOUCH ======
#define PIN_TOUCH     4
#define DEBUG_TOUCH   true

// ====== LUMINA ======
const float AUDIO_ZGOMOT = 400.0f;
const float AUDIO_MAXIM  = 7500.0f;
const int LUM_VOCE_MIN = 10;
const int LUM_VOCE_MAX = 100;
const int AMBIENT_R = 0,   AMBIENT_G = 10,  AMBIENT_B = 180;
const int STREAM_R  = 0,   STREAM_G  = 200, STREAM_B  = 255;
const int PROMPT_R  = 255, PROMPT_G  = 200, PROMPT_B  = 50;
const int CROWD_R   = 255, CROWD_G   = 120, CROWD_B   = 0;
const int POV_R     = 255, POV_G     = 40,  POV_B     = 255;
const float PERIOADA_AMBIENT_MS = 6000.0f;
const unsigned long INTERVAL_TRIMITERE_MS = 80;
const int PRAG_SCHIMBARE_LUM = 2;

// ====== STARE ======
enum Stare { STARE_ASTEAPTA, STARE_REDA };
volatile Stare stare = STARE_ASTEAPTA;
volatile bool stareSchimbata = true;
volatile int audioMod = 0;
volatile int nivelAudio = 0;
volatile bool seDescarca = false;
int preStreamAudioMod = 0;
String currentStreamUrl = "";
volatile int backendState = 0;
volatile int peopleCount  = 0;

SemaphoreHandle_t urlMux;
String queuedUrl = "";
volatile bool hasQueuedUrl = false;

// ====== BEC ======
WiFiUDP udp;
IPAddress becIp;
bool becGasit = false;
unsigned long ultimaCautare = 0;
int incercariCautare = 0;

// ====== TOUCH ======
int baza = 0;
bool atins = false;
int confirmari = 0;
int confirmariRelease = 0;
unsigned long ultimaApasare = 0;
unsigned long ultimulPrintTouch = 0;

// ====== LUMINA ======
float envVoce = 0, envRapid = 0, accent = 0;
float lumNetezit = 10;
float rNet = AMBIENT_R, gNet = AMBIENT_G, bNet = AMBIENT_B;
int ultimaLum = -1, ultimR = -1, ultimG = -1, ultimB = -1;
unsigned long ultimaTrimitere = 0, ultimulSunet = 0;
unsigned long ultimulWiFiCheck = 0;

const char* STREAM_FILE = "/stream.mp3";

// =====================================================================
//  WI-FI
// =====================================================================
void conecteazaWiFi() {
  Serial.printf("[WIFI] ma conectez la '%s' ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] CONECTAT. IP: %s | RSSI: %d dBm | canal: %d\n",
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(), (int)WiFi.channel());
  }
}

// =====================================================================
//  BEC WiZ
// =====================================================================
void trimite(const String& json) {
  if (!becGasit) return;
  udp.beginPacket(becIp, WIZ_PORT);
  udp.print(json);
  udp.endPacket();
}
void trimiteCautare() {
  incercariCautare++;
  const char* msg = "{\"method\":\"getPilot\",\"params\":{}}";
  udp.beginPacket(WiFi.broadcastIP(), WIZ_PORT); udp.print(msg); udp.endPacket();
  udp.beginPacket(IPAddress(255,255,255,255), WIZ_PORT); udp.print(msg); udp.endPacket();
  Serial.printf("[BEC] caut becul (incercarea %d)\n", incercariCautare);
}
void verificaRaspunsBec() {
  int n = udp.parsePacket();
  if (n > 0) {
    IPAddress ip = udp.remoteIP();
    char buf[500]; int len = udp.read(buf, sizeof(buf) - 1);
    if (len < 0) len = 0; buf[len] = 0;
    if (!becGasit && strstr(buf, "getPilot") != NULL) {
      becIp = ip; becGasit = true; ultimaLum = -1;
      Serial.printf("[BEC] GASIT la %s\n", becIp.toString().c_str());
    }
  }
}
void becSeteaza(int lum, int r, int g, int b) {
  lum = constrain(lum, 10, 100);
  r = constrain(r, 0, 255); g = constrain(g, 0, 255); b = constrain(b, 0, 255);
  trimite("{\"id\":1,\"method\":\"setPilot\",\"params\":{\"state\":true,\"r\":" +
          String(r) + ",\"g\":" + String(g) + ",\"b\":" + String(b) +
          ",\"dimming\":" + String(lum) + "}}");
}

// =====================================================================
//  ESP8266Audio -> I2S
// =====================================================================
class MyI2SOutput : public AudioOutput {
  int channels = 2;
  int16_t blk[CHUNK * 2];
  int nblk = 0;
  void flushBlk() {
    if (nblk > 0) {
      size_t w = 0;
      i2s_write(I2S_PORT, blk, nblk * 2 * sizeof(int16_t), &w, portMAX_DELAY);
      nblk = 0;
    }
  }
public:
  bool SetRate(int hz) override {
    Serial.printf("[PLAY] SetRate %d Hz\n", hz);
    flushBlk();
    i2s_zero_dma_buffer(I2S_PORT);
    i2s_set_clk(I2S_PORT, hz, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);
    return true;
  }
  bool SetBitsPerSample(int bits) override { return bits == 16; }
  bool SetChannels(int ch) override { channels = ch; return true; }
  bool begin() override { nblk = 0; return true; }
  bool stop()  override { flushBlk(); return true; }
  bool ConsumeSample(int16_t sample[2]) override {
    int32_t s0 = sample[0];
    int32_t s1 = (channels == 1) ? sample[0] : sample[1];
    s0 = (int32_t)(s0 * STREAM_GAIN);
    s1 = (int32_t)(s1 * STREAM_GAIN);
    if (s0 >  32767) s0 =  32767;
    if (s0 < -32768) s0 = -32768;
    if (s1 >  32767) s1 =  32767;
    if (s1 < -32768) s1 = -32768;
    blk[2 * nblk]     = (int16_t)s0;
    blk[2 * nblk + 1] = (int16_t)s1;
    nblk++;
    int32_t a = s0 < 0 ? -s0 : s0;
    nivelAudio = (nivelAudio * 7 + a) / 8;
    if (nblk >= CHUNK) flushBlk();
    return true;
  }
};

// =====================================================================
//  DESCARCARE IN SPIFFS
// =====================================================================
bool descarcaInSpiffs(const String& url) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[DL] WiFi nu e conectat");
    return false;
  }

  size_t liberBytes = SPIFFS.totalBytes() - SPIFFS.usedBytes();
  Serial.printf("[DL] SPIFFS liber=%u\n", (unsigned)liberBytes);

  HTTPClient http;
  http.setTimeout(15000);
  http.setReuse(false);
  if (!http.begin(url)) {
    Serial.println("[DL] http.begin() esuat");
    return false;
  }

  unsigned long t0 = millis();
  int code = http.GET();
  Serial.printf("[DL] HTTP %d dupa %lu ms\n", code, millis() - t0);
  if (code != 200) {
    if (code < 0) Serial.printf("[DL] eroare: %s\n", http.errorToString(code).c_str());
    http.end();
    return false;
  }

  int total = http.getSize();
  Serial.printf("[DL] marime anuntata: %d octeti\n", total);
  if (total > 0 && (size_t)total > liberBytes) {
    Serial.printf("[DL] PREA MARE pentru SPIFFS (%d > %u)\n", total, (unsigned)liberBytes);
    http.end();
    return false;
  }

  File f = SPIFFS.open(STREAM_FILE, FILE_WRITE);
  if (!f) {
    Serial.println("[DL] nu pot deschide fisierul pe SPIFFS");
    http.end();
    return false;
  }

  int written = http.writeToStream(&f);
  size_t size = f.size();
  f.close();
  http.end();

  unsigned long dt = millis() - t0;
  Serial.printf("[DL] scris %u octeti in %lu ms (writeToStream=%d)\n",
                (unsigned)size, dt, written);

  if (size == 0) {
    Serial.println("[DL] !!! fisier gol, ceva a mers prost");
    SPIFFS.remove(STREAM_FILE);
    return false;
  }
  return true;
}

// =====================================================================
//  AUDIO DE LA SERVER
// =====================================================================
void streamURL(const String& url, int modAsteptat) {
  Serial.printf("\n[STREAM] >>> URL: %s\n", url.c_str());
  bool isPrompt = (url.indexOf("/prompt") >= 0);
  seDescarca = true;

  bool ok = false;
  for (int incercare = 1; incercare <= 3 && audioMod == modAsteptat; incercare++) {
    if (descarcaInSpiffs(url)) { ok = true; break; }
    Serial.printf("[DL] esuat (incercarea %d/3)\n", incercare);
    vTaskDelay(pdMS_TO_TICKS(500));
  }
  seDescarca = false;

  if (!ok) { Serial.println("[DL] !!! n-am reusit sa descarc, renunt"); nivelAudio = 0; return; }
  if (audioMod != modAsteptat) { SPIFFS.remove(STREAM_FILE); return; }

  Serial.println("[PLAY] pornesc redarea din SPIFFS");
  AudioFileSourceSPIFFS* src = new AudioFileSourceSPIFFS(STREAM_FILE);
  AudioGeneratorMP3* gen = new AudioGeneratorMP3();
  MyI2SOutput* out = new MyI2SOutput();

  if (!gen->begin(src, out)) {
    Serial.println("[PLAY] !!! begin() ESUAT");
    delete gen; delete src; delete out;
    SPIFFS.remove(STREAM_FILE);
    nivelAudio = 0;
    return;
  }

  if (!isPrompt) {
    HTTPClient ack;
    ack.setTimeout(8000);
    if (ack.begin(BACKEND_ACK_URL)) {
      unsigned long tAck = millis();
      int ackCode = ack.POST("");
      Serial.printf("[ACK] POST -> HTTP %d dupa %lu ms\n", ackCode, millis() - tAck);
      ack.end();
    }
  } else {
    Serial.println("[ACK] skip (este prompt)");
  }

  unsigned long t0 = millis();
  while (audioMod == modAsteptat && gen->isRunning()) {
    if (!gen->loop()) { gen->stop(); break; }
  }
  if (gen->isRunning()) gen->stop();
  Serial.printf("[PLAY] terminat (durata %lu ms)\n", millis() - t0);

  delete gen;
  delete src;
  delete out;
  SPIFFS.remove(STREAM_FILE);
  i2s_zero_dma_buffer(I2S_PORT);
  nivelAudio = 0;
}

// =====================================================================
//  TASK AUDIO
// =====================================================================
void reda(const int16_t* data, size_t len, int modAsteptat) {
  static int16_t buf[CHUNK * 2];
  size_t idx = 0;
  i2s_zero_dma_buffer(I2S_PORT);
  i2s_set_clk(I2S_PORT, FRAZA_RATE, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);
  while (idx < len && audioMod == modAsteptat && !hasQueuedUrl) {
    size_t n = len - idx; if (n > CHUNK) n = CHUNK;
    long suma = 0;
    for (size_t i = 0; i < n; i++) {
      int32_t s = (int16_t)pgm_read_word(&data[idx + i]);
      s = (int32_t)(s * VOLUM);
      if (s >  32767) s =  32767;
      if (s < -32768) s = -32768;
      suma += (s < 0) ? -s : s;
      buf[2*i] = (int16_t)s; buf[2*i+1] = (int16_t)s;
    }
    nivelAudio = (int)(suma / (long)n);
    size_t scris = 0;
    i2s_write(I2S_PORT, buf, n * 2 * sizeof(int16_t), &scris, portMAX_DELAY);
    idx += n;
  }
  i2s_zero_dma_buffer(I2S_PORT);
  nivelAudio = 0;
}

void taskAudio(void* param) {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = FRAZA_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 16, .dma_buf_len = 512,
    .use_apll = false, .tx_desc_auto_clear = true, .fixed_mclk = 0
  };
  i2s_pin_config_t pins = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = PIN_BCLK, .ws_io_num = PIN_LRC,
    .data_out_num = PIN_DIN, .data_in_num = I2S_PIN_NO_CHANGE
  };
  esp_err_t e1 = i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  esp_err_t e2 = i2s_set_pin(I2S_PORT, &pins);
  Serial.printf("[AUDIO] i2s_install=%d i2s_set_pin=%d\n", (int)e1, (int)e2);
  if (e1 != ESP_OK || e2 != ESP_OK) { vTaskDelete(NULL); return; }
  i2s_zero_dma_buffer(I2S_PORT);
  Serial.println("[AUDIO] task pornit");

  for (;;) {
    if (hasQueuedUrl && audioMod != 3) {
      String u;
      if (xSemaphoreTake(urlMux, pdMS_TO_TICKS(10)) == pdTRUE) {
        if (queuedUrl.length() > 0) u = queuedUrl;
        queuedUrl = ""; hasQueuedUrl = false;
        xSemaphoreGive(urlMux);
      }
      if (u.length() > 0) {
        Serial.printf("[AUDIO] ridic din coada: %s\n", u.c_str());
        preStreamAudioMod = audioMod;
        currentStreamUrl = u;
        audioMod = 3;
        continue;
      }
    }
    int mod = audioMod;
    if (mod == 1) {
      Serial.println("[AUDIO] hello");
      reda(hello_audio, HELLO_LEN, 1);
      if (audioMod == 1) audioMod = 0;
    }
    else if (mod == 2) {
      Serial.println("[AUDIO] poveste locala (offline fallback)");
      reda(fraza_audio, FRAZA_LEN, 2);
      if (audioMod == 2) {
        unsigned long t0 = millis();
        while (audioMod == 2 && !hasQueuedUrl && millis() - t0 < 1500) {
          vTaskDelay(pdMS_TO_TICKS(50));
        }
      }
    }
    else if (mod == 3) {
      streamURL(currentStreamUrl, 3);
      if (audioMod == 3) audioMod = preStreamAudioMod;
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// =====================================================================
//  TASK POLLER
// =====================================================================
void pollBackendOnce() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(BACKEND_POLL_URL)) return;
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[POLL] HTTP %d\n", code);
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.printf("[POLL] JSON err: %s\n", body.c_str());
    return;
  }
  const char* state = doc["state"] | "idle";
  int pc            = doc["people_count"] | 0;
  const char* url   = doc["audio_url"] | "";

  peopleCount = pc;
  if      (strcmp(state, "playing") == 0) backendState = 2;
  else if (strcmp(state, "crowded") == 0) backendState = 1;
  else                                    backendState = 0;

  Serial.printf("[POLL] state=%s people=%d url=%s\n",
                state, pc, (url[0] ? url : "(null)"));

  if (backendState == 2 && url[0] != 0) {
    if (xSemaphoreTake(urlMux, pdMS_TO_TICKS(50)) == pdTRUE) {
      queuedUrl = String(url);
      hasQueuedUrl = true;
      xSemaphoreGive(urlMux);
    }
  }
}

void taskPoller(void* param) {
  vTaskDelay(pdMS_TO_TICKS(2000));
  for (;;) {
    if (audioMod != 3) pollBackendOnce();
    vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
  }
}

// =====================================================================
//  TOUCH - FIX v2: auto-calibrare corecta + praguri mai permisive
// =====================================================================
void calibreazaTouch() {
  Serial.println("[TOUCH] calibrez... NU atinge 2s");
  long suma = 0; int minV = 100000, maxV = 0;
  for (int i = 0; i < 20; i++) {
    int v = touchRead(PIN_TOUCH);
    suma += v; if (v < minV) minV = v; if (v > maxV) maxV = v;
    delay(100);
  }
  // FIX: folosim MAX nu MEAN (max = resting, mean poate fi contaminat de zgomot)
  baza = maxV;
  Serial.printf("[TOUCH] baza initiala=%d (min %d, max %d)\n", baza, minV, maxV);
  if (baza < 5) Serial.println("[TOUCH] ATENTIE: baza prea mica -> fir GPIO4?");
}

bool citesteApasare() {
  int v = touchRead(PIN_TOUCH);
  unsigned long acum = millis();

  // FIX: praguri mai permisive (0.75 IN / 0.90 OUT)
  // Din log-ul tau: baza~77, touch~42. IN=58, OUT=69. Ambele prind corect.
  int dynAtins = (int)(baza * 0.75f);
  int dynLiber = (int)(baza * 0.90f);

  // Plafoane de siguranta
  if (dynAtins > 65) dynAtins = 65;
  if (dynAtins < 15) dynAtins = 15;
  if (dynLiber < dynAtins + 8) dynLiber = dynAtins + 8;
  if (dynLiber > 95) dynLiber = 95;

  bool aproapeAtins = (v <= dynAtins);

  if (DEBUG_TOUCH && acum - ultimulPrintTouch > 500) {
    ultimulPrintTouch = acum;
    Serial.printf("[TOUCH] v=%d baza=%d (in<=%d out>=%d) %s | atins=%d | mod=%d\n",
                  v, baza, dynAtins, dynLiber,
                  aproapeAtins ? "IN" : (v >= dynLiber) ? "OUT" : "~",
                  atins ? 1 : 0, (int)audioMod);
  }

  if (atins) {
    if (v >= dynLiber) {
      if (++confirmariRelease >= 10) {
        atins = false; confirmariRelease = 0; confirmari = 0;
        Serial.println("[TOUCH] eliberat");
      }
    } else if (v < dynLiber - 5) confirmariRelease = 0;
  } else {
    if (v <= dynAtins) { if (confirmari < 10) confirmari++; }
    else if (v > dynAtins + 5) confirmari = 0;

    if (confirmari >= 3 && (acum - ultimaApasare > 800)) {
      atins = true; confirmariRelease = 0; confirmari = 0; ultimaApasare = acum;
      Serial.printf("[TOUCH] >>> APASARE (v=%d, baza=%d, in<=%d)\n", v, baza, dynAtins);
      return true;
    }

    // FIX: /4 in loc de /20 (converge in ~200ms, nu in 20 minute)
    if (v >= dynLiber) {
      baza += (v - baza) / 4;
    }
  }
  return false;
}

// =====================================================================
//  LA APASARE -> cere prompt de la server (sau fallback local)
// =====================================================================
void apasat() {
  if (audioMod == 3) {
    Serial.println("[TOUCH] ignorat (audio de la server in curs)");
    return;
  }
  if (hasQueuedUrl) {
    Serial.println("[TOUCH] ignorat (URL deja in coada)");
    return;
  }

  // Offline: toggle fallback local
  if (WiFi.status() != WL_CONNECTED) {
    if (audioMod == 2) {
      stare = STARE_ASTEAPTA; audioMod = 0;
      Serial.println("[STARE] >>> OPRIT local (offline)");
    } else {
      stare = STARE_REDA; audioMod = 2;
      Serial.println("[STARE] >>> PORNIT local (offline fallback)");
    }
    stareSchimbata = true;
    return;
  }

  // Online: queue prompt
  if (xSemaphoreTake(urlMux, pdMS_TO_TICKS(50)) == pdTRUE) {
    queuedUrl = String(BACKEND_PROMPT_URL);
    hasQueuedUrl = true;
    xSemaphoreGive(urlMux);
    stare = STARE_REDA;
    stareSchimbata = true;
    Serial.println("[TOUCH] >>> cer un prompt de la server");
  } else {
    Serial.println("[TOUCH] !!! mutex timeout");
  }
}

// =====================================================================
//  LUMINA
// =====================================================================
void actualizeazaLumina(unsigned long acum) {
  float energie = ((float)nivelAudio - AUDIO_ZGOMOT) / (AUDIO_MAXIM - AUDIO_ZGOMOT);
  energie = constrain(energie, 0.0f, 1.0f);
  float voce = sqrtf(energie);

  if (voce > envVoce) envVoce += (voce - envVoce) * 0.65f;
  else                envVoce += (voce - envVoce) * 0.10f;

  envRapid += (voce - envRapid) * 0.15f;
  float salt = voce - envRapid;
  if (salt > 0.10f) {
    float a = salt * 3.5f; if (a > 1.0f) a = 1.0f;
    if (a > accent) accent = a;
  }
  accent *= 0.88f;

  float tAmb = 0.5f + 0.5f * sinf(acum * 6.2831853f / PERIOADA_AMBIENT_MS);
  float lumTinta, rT, gT, bT;

  bool playingPrompt = (audioMod == 3) && (currentStreamUrl.indexOf("/prompt") >= 0);

  if (audioMod == 3 && seDescarca) {
    lumTinta = 15.0f + tAmb * 40.0f;
    if (playingPrompt) { rT = PROMPT_R; gT = PROMPT_G; bT = PROMPT_B; }
    else               { rT = STREAM_R; gT = STREAM_G; bT = STREAM_B; }
  }
  else if (audioMod == 3) {
    lumTinta = 20.0f + envVoce * 80.0f + accent * 20.0f;
    if (lumTinta > 100) lumTinta = 100;
    if (playingPrompt) { rT = PROMPT_R; gT = PROMPT_G; bT = PROMPT_B; }
    else               { rT = STREAM_R; gT = STREAM_G; bT = STREAM_B; }
  }
  else if (audioMod == 2) {
    lumTinta = 15.0f + envVoce * 85.0f + accent * 25.0f;
    if (lumTinta > 100) lumTinta = 100;
    rT = POV_R; gT = POV_G + accent * 100.0f; bT = POV_B;
  }
  else if (backendState == 1) {
    float crowd = constrain((float)peopleCount / 8.0f, 0.0f, 1.0f);
    lumTinta = 25.0f + crowd * 45.0f + tAmb * 10.0f;
    if (lumTinta > 100) lumTinta = 100;
    rT = CROWD_R; gT = CROWD_G; bT = CROWD_B;
  }
  else {
    lumTinta = 8.0f + tAmb * 10.0f + envVoce * 30.0f;
    rT = AMBIENT_R; gT = AMBIENT_G; bT = AMBIENT_B;
  }

  if (stareSchimbata) {
    rNet = rT; gNet = gT; bNet = bT;
    lumNetezit = lumTinta; ultimaLum = -1;
    stareSchimbata = false;
  }

  lumNetezit += (lumTinta - lumNetezit) * 0.45f;
  rNet += (rT - rNet) * 0.30f;
  gNet += (gT - gNet) * 0.30f;
  bNet += (bT - bNet) * 0.30f;

  int lum = (int)(lumNetezit + 0.5f);
  int r = (int)(rNet + 0.5f), g = (int)(gNet + 0.5f), b = (int)(bNet + 0.5f);

  bool timpOk    = (acum - ultimaTrimitere) >= INTERVAL_TRIMITERE_MS;
  bool lumSchimb = (ultimaLum < 0) || (abs(lum - ultimaLum) >= PRAG_SCHIMBARE_LUM);
  bool culSchimb = (abs(r - ultimR) >= 4) || (abs(g - ultimG) >= 4) || (abs(b - ultimB) >= 4);

  if (becGasit && timpOk && (lumSchimb || culSchimb)) {
    becSeteaza(lum, r, g, b);
    ultimaLum = lum; ultimR = r; ultimG = g; ultimB = b;
    ultimaTrimitere = acum;
  }
}

// =====================================================================
//  SETUP / LOOP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========== FELINAR v7.2 (touch dinamic) ==========");
  Serial.printf("[INFO] PROMPT_URL = %s\n", BACKEND_PROMPT_URL);

  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] !!! MOUNT FAILED");
  } else {
    Serial.printf("[SPIFFS] OK. total=%u, liber=%u\n",
                  (unsigned)SPIFFS.totalBytes(),
                  (unsigned)(SPIFFS.totalBytes() - SPIFFS.usedBytes()));
  }

  urlMux = xSemaphoreCreateMutex();
  conecteazaWiFi();
  udp.begin(4210);

  if (strlen(IP_MANUAL) > 0) {
    becIp.fromString(IP_MANUAL); becGasit = true;
  }
  calibreazaTouch();

  xTaskCreatePinnedToCore(taskAudio,  "audio",  16384, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(taskPoller, "poller",  8192, NULL, 1, NULL, 0);

  stare = STARE_ASTEAPTA;
  stareSchimbata = true;
  audioMod = 1;
  Serial.println("[START]");
}

void loop() {
  unsigned long acum = millis();
  if (WiFi.status() != WL_CONNECTED && acum - ultimulWiFiCheck > 10000) {
    ultimulWiFiCheck = acum;
    WiFi.reconnect();
  }
  verificaRaspunsBec();
  if (!becGasit && WiFi.status() == WL_CONNECTED && acum - ultimaCautare > 3000) {
    ultimaCautare = acum; trimiteCautare();
  } 
  if (citesteApasare()) apasat();
  actualizeazaLumina(acum);
  delay(10);
}
