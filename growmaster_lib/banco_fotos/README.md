# Banco de fotos de cultivo

Fotos reales de cannabis con su ficha de datos. Sirve para dos cosas:

1. **Validar** lo que hoy mide el software (cobertura verde) con imágenes reales.
2. **Entrenar más adelante** un modelo que reconozca problemas (plagas, carencias, estrés).
   Eso no existe todavía y no se puede construir sin fotos etiquetadas.

Estado a 2026-11-11: banco vacío, a la espera de las primeras fotos del fundador.

## Cómo añadir una foto

1. Copiar el archivo a `fotos/` (jpg, png o webp). Nombre sin espacios, por ejemplo
   `2026-11-11_interior_floracion_001.jpg`.
2. Añadir una fila en `manifest.csv`.
3. Comprobar: `python3 growmaster/photo_bank.py check`

## Columnas de `manifest.csv`

| Columna | Valores | Obligatoria |
|---|---|---|
| `archivo` | nombre exacto del archivo en `fotos/` | sí |
| `entorno` | `exterior`, `invernadero`, `tunel`, `interior` | sí |
| `fase` | `plantula`, `vegetativo`, `floracion`, `madre`, `desconocida` | sí |
| `vista` | `cenital` (desde arriba), `oblicua`, `primer_plano` (hoja o cogollo) | sí |
| `luz` | `natural`, `blanca`, `cultivo_violeta`, `infrarrojo`, `desconocida` | sí |
| `estado` | `sano`, `problema`, `sin_etiquetar` | sí |
| `detalle` | qué problema se ve y quién lo identificó | si `estado` es `problema` |
| `origen` | quién hizo la foto o de qué banco de datos viene (con enlace) | sí |
| `licencia` | `propia`, o la licencia exacta del banco de datos | sí |
| `fecha` | fecha de la foto, `AAAA-MM-DD` | no |

`origen` y `licencia` son obligatorias a propósito: una foto de internet sin licencia clara
no se puede usar en un producto comercial.

No inventar etiquetas. Si no se sabe la fase o el estado, usar `desconocida` o `sin_etiquetar`.

## Analizar una foto

    python3 growmaster/photo_bank.py analyze growmaster/banco_fotos/fotos/<archivo> <carpeta_salida>

Devuelve el porcentaje de la imagen que el software cuenta como planta y guarda una copia
con esa zona resaltada, para ver a ojo si acierta.

## Qué mide y qué no

- **Mide**: qué parte de la imagen es vegetación (índice de exceso de verde y umbral de Otsu,
  con OpenCV). Pensado para vistas cenitales.
- **Límite conocido**: el umbral siempre separa la imagen en dos grupos. En una foto sin
  plantas, o toda cubierta de plantas, el porcentaje no significa nada.
- **Luz de cultivo**: bajo luz violeta o rojiza las hojas no se ven verdes y la medida puede
  fallar. Hay que comprobarlo con fotos reales de interior.
- **No hace**: reconocer plagas, carencias, estrés, sexo ni madurez.

## Reconocimiento por forma (decidido, sin implementar)

Decisión del fundador (2026-11-11): la IA debe reconocer la planta por su **morfología**,
no por el color, igual que el reconocimiento facial reconoce una cara por su forma. Bajo
luz violeta o infrarroja el color no sirve; la forma de la hoja sí.

Cómo se traduce a tecnología real:

- Es la misma familia de técnicas que el reconocimiento facial: redes neuronales entrenadas
  con imágenes etiquetadas, que aprenden formas y texturas. No es el mismo modelo: hay que
  entrenar uno con fotos de plantas.
- **Cannabis frente a maleza**: la hoja del cannabis es muy característica; distinguirla de
  otras hojas es un problema de clasificación abordable.
- **Hojas caídas o dañadas**: también se aprende por forma, pero necesita ejemplos
  etiquetados de cada caso (sana, decaída, dañada), en cada tipo de luz.
- **Cámara de infrarrojo cercano o multiespectral**: las hojas reflejan mucho infrarrojo
  cercano, así que la planta destaca del fondo con cualquier luz de cultivo. Con las bandas
  roja e infrarroja se calcula además un índice de vigor (NDVI) que avisa de estrés. Requiere
  esa cámara en el dron; una cámara normal no lo da.
- **Saber qué planta concreta es** (como identificar a una persona): más fiable por su
  posición en el plano o una etiqueta que por su aspecto, porque las plantas cambian cada día.

Nada de esto está construido. El primer paso es este banco: fotos reales, con su tipo de
luz y su estado anotados. Por eso la columna `luz` es obligatoria.

## Tamaño

Unas decenas o pocos cientos de fotos caben en el repositorio. Un banco de miles de imágenes
necesitará almacenamiento externo; decidirlo cuando llegue el caso.

## Instalación

    pip install -r growmaster/requirements.txt
